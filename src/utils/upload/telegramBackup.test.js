import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resumeTelegramBackup } from './telegramBackup'

afterEach(() => vi.useRealTimers())
describe('Telegram backup continuation', () => {
    it('honors retry delay and stops when ready', async () => {
        vi.useFakeTimers()
        const request = vi.fn().mockResolvedValueOnce({ data: { status: 'pending', retryAfterMs: 5000 } })
            .mockResolvedValueOnce({ data: { status: 'ready' } })
        const update = vi.fn()
        const done = resumeTelegramBackup(request, 'folder/a b', new AbortController().signal, update)
        await vi.advanceTimersByTimeAsync(4999)
        expect(request).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        await done
        expect(request).toHaveBeenCalledTimes(2)
        expect(request.mock.calls[0][0].url).toContain('folder%2Fa%20b')
        expect(update).toHaveBeenLastCalledWith({ status: 'ready' })
    })
    it('stops on missing jobs and authentication failures', async () => {
        for (const status of [401, 403, 404]) {
            const request = vi.fn().mockRejectedValue({ response: { status } })
            await resumeTelegramBackup(request, 'id', new AbortController().signal, vi.fn())
            expect(request).toHaveBeenCalledTimes(1)
        }
    })
    it('cancels waiting without issuing another request', async () => {
        vi.useFakeTimers()
        const controller = new AbortController()
        const request = vi.fn().mockResolvedValue({ data: { status: 'pending' } })
        const done = resumeTelegramBackup(request, 'id', controller.signal, vi.fn())
        await vi.advanceTimersByTimeAsync(0)
        controller.abort()
        await done
        expect(request).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(0)
    })
})

it('hands off the actual chunk method to HF and completes the queue once', async () => {
    const source = readFileSync('src/components/upload/UploadForm.vue', 'utf8')
    const start = source.indexOf('async uploadFileInChunks(file) {')
    const end = source.indexOf('    handleRemove(file)', start)
    const request = vi.fn(async options => {
        expect(options.data.get('originalFileSize')).toBe('20000000')
        expect(options.signal).toBeDefined()
        throw { response: { status: 409, data: { error: 'hf_direct_upload_required' } } }
    })
    const component = new Function('axios', `return ({${source.slice(start, end)}})`)(request)
    const item = { uid: 'u', uploadChannel: 'cfr2' }
    const complete = vi.fn()
    Object.assign(component, { fileList: [item], abortControllers: new Map(),
        getFileUploadFolder: () => '', onUploadComplete: complete,
        uploadToHuggingFaceDirect: vi.fn(async () => complete()) })
    await component.uploadFileInChunks({ file: { uid: 'u', name: 'large.bin', size: 20000000 } })
    expect(component.uploadToHuggingFaceDirect).toHaveBeenCalledTimes(1)
    expect(complete).toHaveBeenCalledTimes(1)
    expect(item.uploadChannel).toBe('huggingface')
    expect(item.tieredToHuggingFace).toBe(true)
})
