import { setCommonHeaders } from './fileTools.js';

export function originalCacheKey(context, fileId, metadata) {
    if (!context.env.ORIGINAL_CACHE || context.fileAccess?.adminAuthResult?.authorized !== true ||
        context.request.method !== 'GET' || context.imageTransform?.requested ||
        context.url.searchParams.get('display') === 'thumbnail' ||
        ['Range', 'If-None-Match', 'If-Modified-Since'].some(name => context.request.headers.has(name))) return null;
    if (!String(metadata.FileType || '').startsWith('image/') && !/\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(fileId)) return null;
    return JSON.stringify([fileId, metadata, 'original-v1']);
}

export async function readOriginalCache(context, key, encodedFileName, fileType) {
    if (!key) return null;
    const response = await context.env.ORIGINAL_CACHE.get(key);
    if (!response) return null;
    const headers = new Headers();
    setCommonHeaders(headers, encodedFileName, fileType, context.fileAccess.cacheControl);
    headers.set('Content-Length', response.headers.get('Content-Length'));
    headers.set('X-Original-Cache', 'HIT');
    return new Response(response.body, { headers });
}

export async function storeOriginalCache(context, response) {
    const cache = context.env.ORIGINAL_CACHE;
    const length = Number(response.headers.get('Content-Length'));
    if (!context.originalCacheKey || response.status !== 200 || !response.body || !length ||
        length > cache.maxEntryBytes || (cache.activeWrites || 0) >= 2) return response;
    cache.activeWrites = (cache.activeWrites || 0) + 1;
    const reader = response.clone().body.getReader();
    try {
        const chunks = [];
        let size = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > cache.maxEntryBytes) { reader.cancel().catch(() => {}); return response; }
            chunks.push(value);
        }
        if (!context.request.signal.aborted && size === length) {
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            await cache.put(context.originalCacheKey, bytes);
            response.headers.set('X-Original-Cache', 'MISS');
        }
    } catch {
        reader.cancel().catch(() => {});
        // A cache failure must never prevent reading the original.
    } finally { cache.activeWrites--; }
    return response;
}
