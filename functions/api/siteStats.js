import { readIndex } from '../utils/indexManager.js';
import { getSiteStats, recordVisit } from '../utils/siteStats.js';
import { getDatabase } from '../utils/databaseAdapter.js';

const VISIT_COOKIE = 'imgbed_visit';

function hasVisitCookie(request) {
    const cookies = request.headers.get('Cookie') || '';
    return cookies.split(';').some(part => part.trim().startsWith(`${VISIT_COOKIE}=`));
}

const IMAGE_EXTENSIONS = ['jpg','jpeg','png','gif','webp','avif','bmp','svg','heic','heif','tif','tiff','ico','jxl','apng'];
export function isHostedImage(file) {
    const m=file.metadata || {};
    return String(m.FileType || '').toLowerCase().startsWith('image/') || IMAGE_EXTENSIONS.some(ext=>String(m.FileName || file.id || file.name || '').toLowerCase().endsWith('.'+ext));
}
export async function countHostedImages(context) {
    if(context.env.img_d1) {
        const extensionSQL=IMAGE_EXTENSIONS.map(ext=>`substr(lower(COALESCE(NULLIF(file_name,''),id)),-${ext.length+1}) = '.${ext}'`).join(' OR ');
        const row=await context.env.img_d1.prepare(`SELECT COUNT(*) n FROM files WHERE (expires_at IS NULL OR expires_at > ?) AND COALESCE(timestamp,0) <> 0 AND substr(id,1,7) <> 'manage@' AND substr(id,1,6) <> 'chunk_' AND substr(id,1,15) <> 'upload_session_' AND substr(id,1,10) <> 'multipart_' AND (lower(COALESCE(file_type,'')) LIKE 'image/%' OR ${extensionSQL})`).bind(Math.floor(Date.now()/1000)).first();
        return Number(row.n);
    }
    const result=await readIndex(context,{count:-1,includeSubdirFiles:true});
    if(result.success === false)throw Error('Image count unavailable');
    return (result.files || []).filter(isHostedImage).length;
}
async function getInitialImageCount(context) { return countHostedImages(context); }

function json(data, headers = {}) {
    return new Response(JSON.stringify(data), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...headers
        }
    });
}

async function loadStats(context) {
    const current = await getSiteStats(context.env.img_r2);
    if (current.initialized) return current;
    const [images, legacyVisits] = await Promise.all([
        getInitialImageCount(context),
        getDatabase(context.env).get('manage@siteStats@visits'),
    ]);
    return getSiteStats(context.env.img_r2, images, legacyVisits);
}

export async function onRequestGet(context) {
    const stats = await loadStats(context);
    return json({ visits: stats.visits, images: await countHostedImages(context), imageCountMode:'current', updatedAt:Date.now() });
}

export async function onRequestPost(context) {
    const alreadyCounted = hasVisitCookie(context.request);
    const current = await loadStats(context);
    const stats = alreadyCounted ? current : await recordVisit(context.env.img_r2);
    const headers = alreadyCounted ? {} : {
        'Set-Cookie': `${VISIT_COOKIE}=1; Path=/; Max-Age=86400; SameSite=Lax; Secure`
    };
    return json({ visits: stats.visits, images: await countHostedImages(context), imageCountMode:'current', updatedAt:Date.now() }, headers);
}
