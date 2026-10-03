// Bound transient original-image decoding across all visible cards.
export function createThumbnailQueue(limit = 2) {
    const pending = [];
    let active = 0;
    function drain() {
        while (active < limit && pending.length) {
            pending.sort((a, b) => b.priority() - a.priority());
            const job = pending.shift();
            if (job.signal.aborted) { job.resolve(); continue; }
            active++;
            Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => { active--; drain(); });
        }
    }
    return (run, signal, priority = () => 0) => new Promise((resolve, reject) => {
        pending.push({ run, signal, resolve, reject, priority });
        drain();
    });
}

export const enqueueThumbnail = createThumbnailQueue();
// Only server-sized derivatives use higher concurrency; original fallbacks
// retain the conservative two-job budget.
export const enqueueSmallThumbnail = createThumbnailQueue(2);
