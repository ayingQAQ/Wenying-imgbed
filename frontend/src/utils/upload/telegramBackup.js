// Advance durable backup jobs while the upload page remains open.
export async function resumeTelegramBackup(request, fileId, signal, onUpdate) {
    let failures = 0
    while (!signal.aborted) {
        let delay = 1000
        try {
            const { data } = await request({
                url: '/api/telegramBackupRun?fileId=' + encodeURIComponent(fileId),
                method: 'post', withAuthCode: true, signal, timeout: 60000
            })
            if (signal.aborted) return
            failures = 0
            onUpdate(data)
            if (['ready', 'cancelled', 'missing'].includes(data.status)) return
            delay = Math.max(1000, Number(data.retryAfterMs) || 1000)
        } catch (error) {
            if (signal.aborted) return
            if ([401, 403, 404].includes(error.response?.status)) {
                onUpdate({ status: error.response.status === 404 ? 'missing' : 'deferred' })
                return
            }
            if (++failures >= 5) {
                onUpdate({ status: 'deferred' })
                return
            }
            onUpdate({ status: 'retrying' })
            delay = 1000 * 2 ** failures
        }
        await new Promise(resolve => {
            const finish = () => {
                clearTimeout(timer)
                signal.removeEventListener('abort', finish)
                resolve()
            }
            const timer = setTimeout(finish, Math.min(delay, 2147483647))
            signal.addEventListener('abort', finish, { once: true })
            if (signal.aborted) finish()
        })
    }
}
