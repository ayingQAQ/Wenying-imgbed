// Only management thumbnails use these bytes. The uploaded File remains untouched.
const results = new WeakMap();
let queue = Promise.resolve();

export function makeUploadThumbnail(file) {
    if (!file || !file.type?.startsWith('image/') || file.size > 128 * 1024 ** 2) return Promise.resolve(null);
    if (results.has(file)) return results.get(file);
    const task = queue.then(async () => {
        let bitmap;
        try {
            bitmap = await createImageBitmap(file, { resizeWidth: 480, resizeQuality: 'low' });
            const scale = Math.min(1, 480 / bitmap.width, 480 / bitmap.height);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
            canvas.width = canvas.height = 0;
            return blob?.size <= 256 * 1024 ? blob : null;
        } catch { return null; }
        finally { bitmap?.close(); }
    });
    queue = task.then(() => {}, () => {});
    results.set(file, task);
    return task;
}

export async function makeUploadThumbnailBase64(file) {
    const blob = await makeUploadThumbnail(file);
    if (!blob) return undefined;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return btoa(binary);
}
