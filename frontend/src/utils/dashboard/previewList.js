// All cards share one URL list instead of allocating a rotated list per image.
export function buildPreviewList(files, isImage, getLink, getOriginalLink = getLink) {
    const urls = []
    const originalUrls = []
    const indices = new Map()
    for (const file of files) {
        if (!isImage(file)) continue
        indices.set(file.name, urls.length)
        urls.push(getLink(file.name))
        originalUrls.push(getOriginalLink(file.name))
    }
    return { urls, originalUrls, indices }
}

export function buildDisplayImageUrl(originalUrl, preset) {
    const separator = originalUrl.includes('?') ? '&' : '?'
    return `${originalUrl}${separator}display=${preset}`
}
