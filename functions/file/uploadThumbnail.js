export const thumbnailKey = (fileId, metadata) => JSON.stringify([fileId, metadata, 480, 'webp-v1']);

// Uses bytes already present in the upload, never fetches the stored original.
export async function saveUploadThumbnail(context, fileId, metadata) {
    const { env } = context;
    if (!env.THUMBNAIL_CACHE || !env.IMAGE_PROCESSOR ||
        (!String(metadata.FileType || '').startsWith('image/') && !/\.(jpe?g|png|gif|webp|avif)$/i.test(fileId))) return;
    const provided = context.uploadThumbnail || context.formdata?.get('thumbnail');
    const source = provided || (context.url?.searchParams.get('chunked') !== 'true' ? context.formdata?.get('file') : null);
    if (!source?.stream || source.size > (provided ? 1024 * 1024 : 128 * 1024 * 1024)) return;
    try {
        const result = await env.IMAGE_PROCESSOR.transform(source.stream(), {
            width: 480, height: 480, fit: 'contain', sourceType: source.type,
            outputFormat: 'image/webp', staticThumbnail: true,
        });
        await env.THUMBNAIL_CACHE.put(thumbnailKey(fileId, metadata), new Uint8Array(await result.arrayBuffer()));
    } catch (error) { console.warn('Upload thumbnail generation failed:', error.statusCode || 'processing error'); }
}

export function decodeUploadThumbnail(value) {
    if (typeof value !== 'string' || !value || value.length > 350000) return null;
    try {
        const binary = atob(value);
        return new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: 'image/webp' });
    } catch { return null; }
}
