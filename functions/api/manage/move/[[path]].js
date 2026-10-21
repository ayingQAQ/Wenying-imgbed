import { changeDirectories } from '../../../utils/directories.js';
import { relocateTelegramBackup } from '../../../utils/telegramBackup.js';
import { purgeCFCache, purgeRandomFileListCache, purgePublicFileListCache } from "../../../utils/purgeCache";
import { moveFileInIndex, batchMoveFilesInIndex, rebuildIndex } from "../../../utils/indexManager.js";
import { getDatabase } from '../../../utils/databaseAdapter.js';
import { sanitizeUploadFolder } from "../../../upload/uploadTools.js";
import { cleanPersistedMetadata } from "../../../utils/metadata/metadataSecurity.js";
import { relocatePublicFile } from '../../../utils/publicFileId.js';
import { mapConcurrent } from '../../../utils/concurrent.js';

export async function onRequest(context) {
    const { request, env, params } = context;

    const url = new URL(request.url);

    // 读取目标文件夹，并进行路径安全处理
    const rawDist = url.searchParams.get('dist') || '';
    const dist = sanitizeUploadFolder(rawDist);

    // 读取folder参数，判断是否为文件夹移动请求
    const folder = url.searchParams.get('folder');
    const sourcePath = decodeURIComponent(Array.isArray(params.path) ? params.path.join('/') : params.path).replace(/\/+$/, '');
    const renameTo = url.searchParams.get('renameTo');
    if (renameTo && (folder !== 'true' || sanitizeUploadFolder(renameTo) !== renameTo || renameTo.split('/').slice(0,-1).join('/') !== sourcePath.split('/').slice(0,-1).join('/'))) return Response.json({success:false,error:'Invalid folder rename target'},{status:400});
    const targetPath = renameTo || [dist, sourcePath.split('/').pop()].filter(Boolean).join('/');
    if (sourcePath === targetPath) return Response.json({ success: true, unchanged: true });
    if (folder === 'true' && (dist === sourcePath || dist.startsWith(sourcePath + '/'))) {
        return Response.json({ success: false, error: 'Cannot move a folder into itself' }, { status: 400 });
    }
    if (folder === 'true') {
        try {
            params.path = sourcePath;
            if (renameTo) {
                const parentUrl = new URL('/api/manage/list', url.origin);
                parentUrl.searchParams.set('count','-1'); parentUrl.searchParams.set('dir',dist);
                const listing = await fetch(new Request(parentUrl,{headers:request.headers}));
                if (!listing.ok) throw new Error('Cannot verify target directory');
                const data=await listing.json();
                if (!data.directories?.includes(sourcePath)) return Response.json({success:false,error:'Folder not found'},{status:404});
                if (data.directories.includes(targetPath)) return Response.json({success:false,error:'Target folder exists'},{status:409});
            }
            // 使用队列存储需要处理的文件夹
            const folderQueue = [{
                path: sourcePath,
                dist: dist
            }];

            const processedFiles = [];
            const failedFiles = [];

            while (folderQueue.length > 0) {
                const currentFolder = folderQueue.shift();
                const curFolderName = currentFolder.path.split('/').pop();

                // 获取指定目录下的所有文件
                const listUrl = new URL('/api/manage/list',url.origin);
                listUrl.searchParams.set('count','-1'); listUrl.searchParams.set('dir',currentFolder.path);
                const listRequest = new Request(listUrl, {
                    headers: request.headers,
                });
                const listResponse = await fetch(listRequest);
                if (!listResponse.ok) throw new Error('Cannot read source folder');
                const listData = await listResponse.json();

                const files = listData.files;
                const folderDist = renameTo && currentFolder.path === sourcePath ? targetPath : (currentFolder.dist === '' ? curFolderName : `${currentFolder.dist}/${curFolderName}`);

                // 处理当前文件夹下的所有文件
                const moveResults = await mapConcurrent(files, 4, async file => {
                    const fileId = file.name;
                    const fileName = file.name.split('/').pop();
                    const newFileId = `${folderDist}/${fileName}`;
                    const cdnUrl = `https://${url.hostname}/file/${fileId}`;
                    const success = await moveFile(env, fileId, newFileId, cdnUrl, url, { skipCachePurge: true });
                    return { success, fileId, newFileId };
                });
                for (const result of moveResults) {
                    if (result.success) processedFiles.push({ fileId: result.fileId, newFileId: result.newFileId });
                    else failedFiles.push(result.fileId);
                }

                // 将子文件夹添加到队列
                const directories = listData.directories;
                for (const dir of directories) {
                    folderQueue.push({
                        path: dir,
                        dist: folderDist
                    });
                }
            }

            if (failedFiles.length === 0) {
                const source = sourcePath;
                const target = targetPath;
                if (source !== target) await changeDirectories(env, source, target);
            }

            // 批量从索引中删除文件，添加新文件
            if (processedFiles.length > 0) {
                const indexResult = await batchMoveFilesInIndex(context, processedFiles.map(file => {
                    return {
                        originalFileId: file.fileId,
                        newFileId: file.newFileId,
                    };
                }));
                if (!indexResult.success) return indexFailure(context, processedFiles);
                // Keep aliases durable after the directory/index update too.
                for (const file of processedFiles) await relocatePublicFile(env, file.fileId, file.newFileId);
            }

            await purgeRandomFileListCache(url.origin, sourcePath, targetPath);
            await purgePublicFileListCache(url.origin, sourcePath, targetPath);

            // 返回处理结果
            return new Response(JSON.stringify({
                success: failedFiles.length === 0,
                processed: processedFiles,
                failed: failedFiles
            }), {
                status: failedFiles.length > 0 ? 409 : 200,
                headers: { 'Content-Type': 'application/json' },
            });

        } catch (e) {
            return new Response(JSON.stringify({
                success: false,
                error: e.message
            }), { status: 400 });
        }
    }

    // 单个文件移动处理
    try {
        // 解码params.path
        params.path = decodeURIComponent(params.path);
        const fileId = params.path.split(',').join('/');
        const fileKey = fileId.split('/').pop();
        const newFileId = dist === '' ? fileKey : `${dist}/${fileKey}`;
        const cdnUrl = `https://${url.hostname}/file/${fileId}`;

        const success = await moveFile(env, fileId, newFileId, cdnUrl, url);
        if (!success) {
            throw new Error('Move file failed');
        } else {
            // 从索引中删除旧文件，并添加新文件
            const indexResult = await moveFileInIndex(context, fileId, newFileId);
            if (!indexResult.success) return indexFailure(context, [{ fileId, newFileId }]);
        }

        return new Response(JSON.stringify({
            success: true,
            fileId: fileId,
            newFileId: newFileId
        }));
    } catch (e) {
        return new Response(JSON.stringify({
            success: false,
            error: e.message
        }), { status: 400 });
    }
}

// 移动单个文件的核心函数
export async function moveFile(env, fileId, newFileId, cdnUrl, url, options = {}) {
    try {
        if (fileId === newFileId) return true;
        const db = getDatabase(env);

        // 读取图片信息
        const img = await db.getWithMetadata(fileId);
        if (!img?.metadata) throw new Error('Source file not found');
        const destination = await db.getWithMetadata(newFileId);
        if (destination?.metadata) throw new Error('Destination already exists');

        // 如果是R2渠道的图片，需要移动R2中对应的图片
        if (img.metadata?.Channel === 'CloudflareR2') {
            // Logical directory changes must not copy multi-GB source objects.
            img.metadata.R2FileKey ||= fileId;
        }

        // S3/WebDAV already persist an independent storage key. Move the logical
        // directory only; retaining that key avoids destructive cross-store moves.
        if (img.metadata?.Channel === 'S3') img.metadata.S3FileKey ||= fileId;
        if (img.metadata?.Channel === 'WebDAV') img.metadata.WebDAVFilePath ||= fileId;

        // 旧版 Telegram 渠道和 Telegraph 渠道不支持移动
        if (img.metadata?.Channel === 'Telegram' || img.metadata?.Channel === undefined) {
            throw new Error('Unsupported Channel');
        }

        // 更新文件夹信息，根目录为空，否则为 aaa/123/ 的格式
        const DirectoryPath = newFileId.split('/').slice(0, -1).join('/') === '' ? '' : newFileId.split('/').slice(0, -1).join('/') + '/';
        img.metadata.Directory = DirectoryPath;
        img.metadata = cleanPersistedMetadata(img.metadata);

        // 更新KV存储
        await db.put(newFileId, img.value, { metadata: img.metadata });
        await relocateTelegramBackup(env, newFileId, img.metadata);
        await relocatePublicFile(env, fileId, newFileId);
        await db.delete(fileId);
        // Retain the source bytes until metadata and public links are durable.
        // On an earlier failure duplicates are preferable to an inaccessible source.

        // 清除CDN缓存
        if (!options.skipCachePurge) await purgeCFCache(env, cdnUrl);

        // 清除 api/randomFileList 等API缓存
        const normalizedFolder = fileId.split('/').slice(0, -1).join('/');
        const normalizedDist = newFileId.split('/').slice(0, -1).join('/');
        if (!options.skipCachePurge) {
            await purgeRandomFileListCache(url.origin, normalizedFolder, normalizedDist);
            await purgePublicFileListCache(url.origin, normalizedFolder, normalizedDist);
        }

        return true;
    } catch (e) {
        console.error('Move file failed:', e);
        return false;
    }
}

function indexFailure(context, processed) {
    // Storage already moved; never report full success or invite a destructive retry.
    context.waitUntil(rebuildIndex(context));
    return Response.json({ success: false, error: 'Files moved but index update failed; index recovery scheduled',
        code: 'MOVE_INDEX_PENDING', processed, requiresRefresh: true }, { status: 503 });
}
