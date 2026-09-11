import { expect, it, vi } from 'vitest'
import { buildPreviewList } from './previewList'

it('builds one linear gallery without mutating files, preserving mixed-file order', () => {
    const files = Array.from({ length: 2000 }, (_, i) => Object.freeze({ name: `${i}`, image: i % 2 === 0 }))
    const link = vi.fn(name => `/file/${name}`)
    const result = buildPreviewList(files, file => file.image, link)
    expect(result.urls).toHaveLength(1000)
    expect(link).toHaveBeenCalledTimes(1000)
    expect(result.indices.get('1998')).toBe(999)
    expect(result.urls[result.indices.get('100')]).toBe('/file/100')
    expect(result.indices.has('101')).toBe(false)
    expect(files[0].previewSrcList).toBeUndefined()
})
