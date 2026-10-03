// Compressed management derivatives only. Never cache original image bodies here.
export function createThumbnailBlobCache(maxBytes = 32 * 1024 * 1024) {
    const entries = new Map();
    let bytes = 0;
    return {
        get(key) {
            const value = entries.get(key);
            if (value) { entries.delete(key); entries.set(key, value); }
            return value;
        },
        put(key, value) {
            if (value.size > Math.min(maxBytes, 1024 * 1024)) return;
            bytes -= entries.get(key)?.size || 0;
            entries.delete(key); entries.set(key, value); bytes += value.size;
            while (bytes > maxBytes) {
                const oldest = entries.keys().next().value;
                bytes -= entries.get(oldest).size; entries.delete(oldest);
            }
        },
        clear() { entries.clear(); bytes = 0; },
    };
}
export const thumbnailBlobs = createThumbnailBlobCache();
