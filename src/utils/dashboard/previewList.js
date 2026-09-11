// All cards share one URL list instead of allocating a rotated list per image.
export function buildPreviewList(files, isImage, getLink) {
    const urls = []
    const indices = new Map()
    for (const file of files) {
        if (!isImage(file)) continue
        indices.set(file.name, urls.length)
        urls.push(getLink(file.name))
    }
    return { urls, indices }
}
