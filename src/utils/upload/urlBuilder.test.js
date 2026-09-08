import { describe, expect, it } from 'vitest'
import { buildFileUrls, extractFileId } from './urlBuilder'

describe('upload URL formatting', () => {
    it('builds public URL formats for guest file IDs', () => {
        const result = buildFileUrls('guest/abc/image.png', 'image.png', 'https://imgb.top/file/')
        expect(result.finalURL).toBe('https://imgb.top/file/guest/abc/image.png')
        expect(result.mdURL).toBe('![image.png](https://imgb.top/file/guest/abc/image.png)')
        expect(result.htmlURL).toContain('src="https://imgb.top/file/guest/abc/image.png"')
        expect(result.ubbURL).toBe('[img]https://imgb.top/file/guest/abc/image.png[/img]')
    })

    it('extracts IDs from relative, absolute, and raw upload responses', () => {
        expect(extractFileId('/file/guest/abc/image.png')).toBe('guest/abc/image.png')
        expect(extractFileId('https://imgb.top/file/guest/abc/image.png')).toBe('guest/abc/image.png')
        expect(extractFileId('guest/abc/image.png')).toBe('guest/abc/image.png')
    })
})
