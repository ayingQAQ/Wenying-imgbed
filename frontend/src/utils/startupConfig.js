// A stalled configuration request must not keep every route blank forever.
export async function requestStartupConfig(load, timeoutMs = 5000) {
    const controller = new AbortController();
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(() => load({ signal: controller.signal, timeout: timeoutMs })),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error('配置请求超时'));
                    controller.abort();
                }, timeoutMs);
            }),
        ]);
    } finally { clearTimeout(timer); }
}

export async function loadStartupConfigUntilReady({ load, hasCached, onRetry = () => {} }) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const loaded = await load();
        if (loaded || hasCached()) return true;
        if (attempt < 2) {
            onRetry();
            await new Promise(resolve => setTimeout(resolve, 1200));
        }
    }
    return false;
}
