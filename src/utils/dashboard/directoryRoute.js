export function directoryFromRoute(value) {
    const path = Array.isArray(value) ? value[0] : value
    if (!path) return ''
    const normalized = String(path).replace(/^\/+|\/+$/g, '')
    return normalized ? `${normalized}/` : ''
}

export function directoryRouteQuery(path) {
    const normalized = String(path || '').replace(/^\/+|\/+$/g, '')
    return normalized || undefined
}
