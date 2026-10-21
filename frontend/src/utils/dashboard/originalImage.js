// Keep only the current original image alive; never re-encode its bytes.
export function createOriginalImageLoader() {
    let controller
    let objectUrl = ''
    function release() {
        controller?.abort()
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = ''
    }
    async function load(url) {
        release()
        const request = new AbortController()
        controller = request
        const response = await fetch(url, { signal: request.signal, credentials: 'same-origin' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        if (request.signal.aborted) return ''
        objectUrl = URL.createObjectURL(blob)
        return objectUrl
    }
    return { load, release }
}
