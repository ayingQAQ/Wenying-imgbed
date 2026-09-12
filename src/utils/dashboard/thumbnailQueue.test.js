import { expect, it } from 'vitest';
import { createThumbnailQueue } from './thumbnailQueue';

it('limits concurrent original decoding and skips cancelled offscreen images', async () => {
    const enqueue = createThumbnailQueue(2);
    let active = 0;
    let peak = 0;
    let started = 0;
    const finish = [];
    const controllers = Array.from({ length: 6 }, () => new AbortController());
    const work = controllers.map(c => enqueue(async () => {
        started++;
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => finish.push(resolve));
        active--;
    }, c.signal));
    await Promise.resolve();
    expect(started).toBe(2);
    controllers.slice(2).forEach(c => c.abort());
    finish.forEach(resolve => resolve());
    await Promise.all(work);
    expect(peak).toBe(2);
    expect(started).toBe(2);
});

it('continues after a failed image rather than blocking the queue', async () => {
    const enqueue = createThumbnailQueue(1);
    const signal = new AbortController().signal;
    const failed = enqueue(() => { throw new Error('bad image'); }, signal);
    const next = enqueue(() => 'next image', signal);
    await expect(failed).rejects.toThrow('bad image');
    await expect(next).resolves.toBe('next image');
});
