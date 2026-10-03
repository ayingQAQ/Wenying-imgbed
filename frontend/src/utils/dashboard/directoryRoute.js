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

// Keep only a bounded in-memory navigation cache; durable mappings are server-side.
export function createDirectoryLinks(fetcher) {
    const paths = new Map()
    const ids = new Map()
    const remember = (id, path) => {
        if (ids.size >= 200 && !ids.has(id)) {
            const oldest = ids.keys().next().value
            paths.delete(ids.get(oldest))
            ids.delete(oldest)
        }
        ids.set(id, path)
        paths.set(path, id)
    }
    const request = async (url, options) => {
        const response = await fetcher(url, options)
        if (!response.ok) throw new Error(response.status === 401 ? 'Unauthorized' : '无法打开目录链接，请重试')
        return response.json()
    }
    return {
        async query(path, query = {}) {
            const normalized = directoryRouteQuery(path)
            const result = { ...query }
            delete result.dir
            delete result.d
            if (!normalized) return result
            let id = paths.get(normalized)
            if (!id) {
                const data = await request('/api/manage/directoryLink', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: normalized })
                })
                id = data.id
                if (!/^d_[a-f0-9]{64}$/.test(id || '')) throw new Error('无效的目录链接')
                remember(id, normalized)
            }
            result.d = id
            return result
        },
        async resolve(query = {}) {
            const id = Array.isArray(query.d) ? query.d[0] : query.d
            if (!id) {
                const path = directoryFromRoute(query.dir)
                return { path, query: await this.query(path, query) }
            }
            if (!/^d_[a-f0-9]{64}$/.test(id)) throw new Error('无效的目录链接')
            let path = ids.get(id)
            if (!path) {
                const data = await request(`/api/manage/directoryLink?id=${id}`)
                path = directoryRouteQuery(data.path)
                if (!path) throw new Error('无效的目录链接')
                remember(id, path)
            }
            const result = { ...query, d: id }
            delete result.dir
            return { path: directoryFromRoute(path), query: result }
        }
    }
}
