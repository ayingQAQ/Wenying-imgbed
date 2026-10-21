import { setCommonHeaders } from './fileTools.js';

export function originalCacheKey(context, fileId, metadata) {
    if (!context.env.ORIGINAL_CACHE || context.fileAccess?.adminAuthResult?.authorized !== true ||
        context.request.method !== 'GET' || context.imageTransform?.requested ||
        context.url.searchParams.get('display') === 'thumbnail' ||
        context.request.headers.has('Range')) return null;
    if (!String(metadata.FileType || '').startsWith('image/') && !/\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(fileId)) return null;
    return JSON.stringify([fileId, metadata, 'original-v1']);
}

export async function readOriginalCache(context, key, encodedFileName, fileType) {
    if (!key) return null;
    const cache = context.env.ORIGINAL_CACHE;
    const pending = cache.pendingWrites?.get(key);
    if (pending) {
        const signal = context.request.signal;
        signal.throwIfAborted();
        let abort;
        try {
            await Promise.race([pending, new Promise((_, reject) => {
                abort = () => reject(signal.reason);
                signal.addEventListener('abort', abort, { once: true });
            })]);
        } finally { signal.removeEventListener('abort', abort); }
    }
    const response = await cache.get(key);
    if (!response) return null;
    const headers = new Headers();
    setCommonHeaders(headers, encodedFileName, fileType, context.fileAccess.cacheControl);
    headers.set('X-Original-Cache', 'HIT');
    const etag = await originalETag(key);
    headers.set('ETag', etag);
    const requested = context.request.headers.get('If-None-Match');
    if (requested?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag)) {
        await response.body?.cancel();
        return new Response(null, { status: 304, headers });
    }
    const length = response.headers.get('Content-Length');
    if (length) headers.set('Content-Length', length);
    return new Response(response.body, { headers });
}

async function originalETag(key) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return '"original-' + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') + '"';
}

export async function storeOriginalCache(context, response) {
    const cache = context.env.ORIGINAL_CACHE;
    const length = Number(response.headers.get('Content-Length'));
    if (!context.originalCacheKey || response.status !== 200 || !response.body || !length ||
        length > cache.maxEntryBytes || (cache.activeWrites || 0) >= 2) return response;
    const headers = new Headers(response.headers);
    headers.set('X-Original-Cache', 'MISS');
    headers.set('ETag', await originalETag(context.originalCacheKey));
    cache.activeWrites = (cache.activeWrites || 0) + 1;
    cache.pendingWrites ||= new Map();
    let finishWrite;
    const pending = new Promise(resolve => { finishWrite = resolve; });
    cache.pendingWrites.set(context.originalCacheKey, pending);
    const reader = response.body.getReader();
    let chunks = [], size = 0, released = false;
    const release = () => {
        if (released) return;
        released = true;
        chunks = [];
        cache.activeWrites--;
        if (cache.pendingWrites.get(context.originalCacheKey) === pending) cache.pendingWrites.delete(context.originalCacheKey);
        finishWrite();
    };
    // Tap only bytes the browser consumes: no full-file buffering before headers,
    // no independent tee branch that keeps downloading after the viewer closes.
    const body = new ReadableStream({
        async pull(controller) {
            try {
                const { value, done } = await reader.read();
                if (released) return;
                if (done) {
                    if (!context.request.signal.aborted && size === length) {
                        const bytes = new Uint8Array(size);
                        let offset = 0;
                        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
                        try { await cache.put(context.originalCacheKey, bytes); } catch { /* Cache failure never blocks originals. */ }
                    }
                    release(); reader.releaseLock(); controller.close();
                    return;
                }
                size += value.byteLength;
                if (size <= cache.maxEntryBytes) chunks.push(value);
                else chunks = [];
                controller.enqueue(value);
            } catch (error) {
                release();
                void reader.cancel(error).catch(() => {});
                controller.error(error);
            }
        },
        async cancel(reason) {
            release();
            await reader.cancel(reason).catch(() => {});
        },
    }, { highWaterMark: 0 });
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
