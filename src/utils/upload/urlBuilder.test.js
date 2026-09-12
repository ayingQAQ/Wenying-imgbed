import { describe, expect, it } from 'vitest'
import { buildFileUrls, extractFileId } from './urlBuilder'
import { createHash } from 'node:crypto'

describe('upload URL formatting', () => {
    it('builds public URL formats for guest file IDs', () => {
        const result = buildFileUrls('guest/abc/image.png', 'image.png', 'https://imgb.top/file/')
        const alias = `p_${createHash('sha256').update('guest/abc/image.png').digest('hex')}.png`
        const url = `https://imgb.top/file/${alias}`
        expect(result.finalURL).toBe(url)
        expect(result.mdURL).toBe(`![图片](${url})`)
        expect(result.htmlURL).toContain('alt="图片"')
        expect(result.htmlURL).toContain(`src="${url}"`)
        expect(result.ubbURL).toBe(`[img]${url}[/img]`)
        expect(buildFileUrls(alias, 'image.png', 'https://imgb.top/file/').finalURL).toBe(url)
        expect(buildFileUrls('其他/image.png', 'image.png', 'https://imgb.top/file/').finalURL).not.toBe(url)
    })

    it('extracts IDs from relative, absolute, and raw upload responses', () => {
        expect(extractFileId('/file/guest/abc/image.png')).toBe('guest/abc/image.png')
        expect(extractFileId('https://imgb.top/file/guest/abc/image.png')).toBe('guest/abc/image.png')
        expect(extractFileId('guest/abc/image.png')).toBe('guest/abc/image.png')
    })
})
