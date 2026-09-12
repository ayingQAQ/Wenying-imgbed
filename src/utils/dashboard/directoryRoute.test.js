import { describe, expect, it } from 'vitest'
import { directoryFromRoute, directoryRouteQuery } from './directoryRoute'

describe('dashboard directory browser history', () => {
    it('restores the current folder from a route query', () => {
        expect(directoryFromRoute(undefined)).toBe('')
        expect(directoryFromRoute('色图')).toBe('色图/')
        expect(directoryFromRoute('色图/相册/')).toBe('色图/相册/')
    })

    it('writes folders into the route without a trailing slash', () => {
        expect(directoryRouteQuery('')).toBeUndefined()
        expect(directoryRouteQuery('色图/')).toBe('色图')
        expect(directoryRouteQuery('色图/相册/')).toBe('色图/相册')
    })
})
