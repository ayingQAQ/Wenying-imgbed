import JSZip from 'jszip';

export const MAX_ZIP_BYTES = 64 * 1024 * 1024;
function uniqueName(file, used) {
    const name = String(file.metadata?.FileName || file.name).split(/[\\/]/).pop() || 'image';
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name, count = 1;
    while (used.has(candidate.toLowerCase())) candidate = `${stem}(${count++})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
}
function checkAbort(signal) { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); }

// A bounded in-memory archive: sequential reads and a hard limit on actual bytes,
// including responses with missing or inaccurate Content-Length headers.
export async function createBatchZip(files, getLink, { signal, onProgress = () => {}, maxBytes = MAX_ZIP_BYTES, fetcher = fetch } = {}) {
    const selected = files.filter(file => !file.isFolder);
    if (!selected.length) throw new Error('请先选择文件');
    if (selected.length > 200 || selected.reduce((sum, f) => sum + (Number(f.metadata?.FileSize) || 0) * 1048576, 0) > maxBytes) {
        throw new Error('批量打包最多 200 个文件、64 MB，请分批下载');
    }
    const zip = new JSZip();
    const used = new Set();
    let total = 0;
    for (const [index, file] of selected.entries()) {
        checkAbort(signal);
        const timeout = new AbortController();
        const abort = () => timeout.abort();
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 60000);
        let response, reader;
        try {
            response = await fetcher(getLink(file.name), { signal: timeout.signal, credentials: 'same-origin' });
            if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
            if (total + Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('打包超过 64 MB，请分批下载');
            reader = response.body.getReader();
            const chunks = [];
            while (true) {
                checkAbort(signal);
                const { done, value } = await reader.read();
                if (done) break;
                total += value.byteLength;
                if (total > maxBytes) throw new Error('打包超过 64 MB，请分批下载');
                chunks.push(value);
            }
            // ArrayBuffers work in browsers and test runtimes; no image re-encoding.
            zip.file(uniqueName(file, used), await new Blob(chunks).arrayBuffer());
            onProgress(index + 1, selected.length);
        } finally {
            if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
            else if (response?.body) await response.body.cancel().catch(() => {});
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }
    checkAbort(signal);
    return zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, () => checkAbort(signal));
}

export function saveZip(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    try {
        link.href = url; link.download = 'files.zip';
        document.body.appendChild(link); link.click();
    } finally {
        link.remove();
        // Let the browser consume the download before releasing the URL.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
