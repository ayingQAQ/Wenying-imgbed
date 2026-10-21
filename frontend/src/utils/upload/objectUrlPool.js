// Only revoke URLs created by this owner, never remote or library-owned URLs.
export function createObjectUrlPool() {
    const urls = new Set();
    return {
        create(blob) { const url = URL.createObjectURL(blob); urls.add(url); return url; },
        release(url) { if (urls.delete(url)) URL.revokeObjectURL(url); },
        dispose() { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); },
    };
}
