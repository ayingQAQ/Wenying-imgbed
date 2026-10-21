import { readIndex } from '../../../utils/indexManager.js';

export function aggregateUploadSources(files) {
    const groups = new Map();
    const summary = {totalFiles: files.length, totalSizeMB: 0, unknownSizeFiles: 0, totalSources: 0};
    for (const file of files) {
        const m = file.metadata || {}, size = Number(m.FileSize);
        const valid = m.FileSize != null && m.FileSize !== '' && Number.isFinite(size) && size >= 0;
        if (valid) summary.totalSizeMB += size; else summary.unknownSizeFiles++;
        if (!m.UploadIP) continue;
        const row = groups.get(m.UploadIP) || {ip:m.UploadIP,address:m.UploadAddress || '未知',count:0,totalSizeMB:0,lastUpload:0};
        row.count++; row.totalSizeMB += valid ? size : 0;
        row.lastUpload = Math.max(row.lastUpload, Number(m.TimeStamp) || 0);
        groups.set(m.UploadIP,row);
    }
    summary.totalSources = groups.size;
    return {sources:[...groups.values()].sort((a,b)=>b.count-a.count || a.ip.localeCompare(b.ip)),summary};
}

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const start = Math.max(0, Number.parseInt(url.searchParams.get('start')) || 0);
    const count = Math.min(1000, Math.max(1, Number.parseInt(url.searchParams.get('count')) || 10));
    let sources, summary;
    if (context.env.img_d1) {
        const where = "(expires_at IS NULL OR expires_at > ?) AND COALESCE(timestamp,0) <> 0 AND substr(id,1,7) <> 'manage@' AND substr(id,1,6) <> 'chunk_' AND substr(id,1,15) <> 'upload_session_' AND substr(id,1,10) <> 'multipart_'";
        const now = Math.floor(Date.now()/1000), db = context.env.img_d1;
        summary = await db.prepare(`SELECT COUNT(*) totalFiles, COALESCE(SUM(MAX(COALESCE(file_size,0),0)),0) totalSizeMB, SUM(CASE WHEN file_size IS NULL THEN 1 ELSE 0 END) unknownSizeFiles, COUNT(DISTINCT NULLIF(upload_ip,'')) totalSources FROM files WHERE ${where}`).bind(now).first();
        const result = await db.prepare(`SELECT upload_ip ip, COALESCE(NULLIF(MAX(upload_address),''),'未知') address, COUNT(*) count, COALESCE(SUM(MAX(COALESCE(file_size,0),0)),0) totalSizeMB, MAX(timestamp) lastUpload FROM files WHERE ${where} AND COALESCE(upload_ip,'') <> '' GROUP BY upload_ip ORDER BY count DESC, upload_ip LIMIT ? OFFSET ?`).bind(now,count,start).all();
        sources = result.results;
    } else {
        const records = await readIndex(context,{count:-1,includeSubdirFiles:true});
        if(records.success === false) return Response.json({error:'Index unavailable'},{status:503});
        const result = aggregateUploadSources(records.files || []); summary=result.summary; sources=result.sources.slice(start,start+count);
    }
    return Response.json(url.searchParams.get('format') === 'summary' ? {sources,summary,hasMore:start+sources.length<summary.totalSources} : sources,{headers:{'Cache-Control':'private, no-store'}});
}
