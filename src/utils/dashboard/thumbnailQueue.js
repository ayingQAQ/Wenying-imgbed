// Bound transient original-image decoding across all visible cards.
export function createThumbnailQueue(limit = 2) {
    const pending = [];
    let active = 0;
    function drain() {
        while (active < limit && pending.length) {
            const job = pending.shift();
            if (job.signal.aborted) { job.resolve(); continue; }
            active++;
            Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => { active--; drain(); });
        }
    }
    return (run, signal) => new Promise((resolve, reject) => {
        pending.push({ run, signal, resolve, reject });
        drain();
    });
}

export const enqueueThumbnail = createThumbnailQueue();
