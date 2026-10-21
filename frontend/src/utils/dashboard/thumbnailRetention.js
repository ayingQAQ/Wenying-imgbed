// Retain small offscreen canvases, never original images. Eviction releases pixels.
export function createThumbnailRetention(maxBytes = 64 * 1024 * 1024) {
    const entries = new Map();
    let bytes = 0;
    const forget = key => {
        const entry = entries.get(key);
        if (entry) { bytes -= entry.bytes; entries.delete(key); }
    };
    return {
        forget,
        retain(key, size, release) {
            forget(key);
            entries.set(key, { bytes: size, release });
            bytes += size;
            while (bytes > maxBytes && entries.size) {
                const oldest = entries.keys().next().value;
                const entry = entries.get(oldest);
                forget(oldest);
                entry.release();
            }
        },
    };
}

export const thumbnailRetention = createThumbnailRetention(
    typeof navigator !== 'undefined' && (/Android|iPhone|iPad/i.test(navigator.userAgent) || navigator.deviceMemory <= 4)
        ? 32 * 1024 * 1024 : 64 * 1024 * 1024
);
