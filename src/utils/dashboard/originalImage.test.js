import { expect, it, vi, afterEach } from 'vitest'
import { createOriginalImageLoader } from './originalImage'
afterEach(() => vi.restoreAllMocks())
it('uses original bytes and releases images on navigation and close', async () => {
    const blob = new Blob(['original bytes'])
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => blob })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const loader = createOriginalImageLoader()
    expect(await loader.load('/file/original.png')).toBe('blob:first')
    expect(create).toHaveBeenCalledWith(blob)
    await loader.load('/file/next.png')
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    expect(revoke).toHaveBeenCalledWith('blob:first')
    loader.release()
    expect(revoke).toHaveBeenCalledWith('blob:second')
})
it('does not create an image after the preview closes during loading', async () => {
    let finish
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: () => new Promise(resolve => { finish = resolve }) })
    const create = vi.spyOn(URL, 'createObjectURL')
    const loader = createOriginalImageLoader()
    const pending = loader.load('/file/large.png')
    await Promise.resolve()
    loader.release()
    finish(new Blob(['original']))
    expect(await pending).toBe('')
    expect(create).not.toHaveBeenCalled()
})
