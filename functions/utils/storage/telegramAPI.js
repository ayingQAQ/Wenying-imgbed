import { fetchUpstream } from '../upstreamFetch.js';
import { abortableDelay } from '../upstreamFetch.js';

// One queue shared by all uploads to the same bot/chat in this process.
// Keep credentials in memory only; never log queue keys or request URLs.
const uploadQueues = new Map();
async function queuedUpload(key, signal, send) {
    let queue = uploadQueues.get(key);
    if (!queue) { queue = { tail: Promise.resolve(), next: 0, pending: 0 }; uploadQueues.set(key, queue); }
    const previous = queue.tail;
    let release;
    queue.tail = new Promise(resolve => { release = resolve; });
    queue.pending++;
    // A cancelled waiter must not let later requests jump past an active upload.
    let abort;
    try {
        await Promise.race([previous, new Promise((_, reject) => {
            abort = () => reject(signal.reason);
            if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
        })]);
        signal?.removeEventListener('abort', abort);
        signal?.throwIfAborted();
        await abortableDelay(Math.max(0, queue.next - Date.now()), signal);
        queue.next = Date.now() + 1100;
        return await send(async retryMs => {
            queue.next = Math.max(queue.next, Date.now() + retryMs);
            await abortableDelay(Math.max(0, queue.next - Date.now()), signal);
            queue.next = Date.now() + 1100;
        });
    } finally {
        signal?.removeEventListener('abort', abort);
        // Only remove idle queues after their final cooldown has elapsed.
        void previous.then(() => {
            release(); queue.pending--;
            if (!queue.pending) {
                const timer = setTimeout(() => {
                    if (!queue.pending && queue.next <= Date.now() && uploadQueues.get(key) === queue) uploadQueues.delete(key);
                }, Math.max(0, queue.next - Date.now()) + 1);
                timer.unref?.();
            }
        });
    }
}
/**
 * Telegram API 封装类
 */
export class TelegramAPI {
    constructor(botToken, proxyUrl = '') {
        this.botToken = botToken;
        this.proxyUrl = proxyUrl;
        // 如果设置了代理域名，使用代理域名，否则使用官方 API
        const apiDomain = proxyUrl ? `https://${proxyUrl}` : 'https://api.telegram.org';
        this.baseURL = `${apiDomain}/bot${this.botToken}`;
        this.fileDomain = proxyUrl ? `https://${proxyUrl}` : 'https://api.telegram.org';
        this.defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
        };
    }

    /**
     * 发送文件到Telegram
     * @param {File} file - 要发送的文件
     * @param {string} chatId - 聊天ID
     * @param {string} functionName - API方法名（如：sendPhoto, sendDocument等）
     * @param {string} functionType - 文件类型参数名（如：photo, document等）
     * @returns {Promise<Object>} API响应结果
     */
    async sendFile(file, chatId, functionName, functionType, caption = '', fileName = '', { signal } = {}) {
        return queuedUpload(JSON.stringify([this.baseURL, chatId]), signal, async cooldown => {
        for (let attempt = 0; attempt < 3; attempt++) {
        const formData = new FormData();

        formData.append('chat_id', chatId);
        if (fileName) {
            formData.append(functionType, file, fileName);
        } else {
            formData.append(functionType, file);
        }
        if (caption) {
            formData.append('caption', caption);
        }

        const response = await fetch(`${this.baseURL}/${functionName}`, {
            method: 'POST',
            headers: this.defaultHeaders,
            body: formData,
            signal
        });
        console.log('Telegram API response:', response.status, response.statusText);
        // Consume every response, including 429, to release the HTTP connection.
        let responseData;
        try { responseData = await response.json(); } catch { responseData = {}; }
        if (response.status === 429 || responseData.error_code === 429) {
            const seconds = Number(responseData.parameters?.retry_after || response.headers.get('Retry-After'));
            const retryMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 + 100 : 5000;
            console.warn('Telegram upload cooling down:', Math.ceil(retryMs / 1000), 'seconds');
            await cooldown(retryMs);
            if (attempt < 2) continue;
            throw Object.assign(new Error('Telegram upload rate limited; retry after cooldown'), { status: 429 });
        }
        if (!response.ok || responseData.ok === false) {
            throw Object.assign(new Error(`Telegram API error: HTTP ${response.status}`), { status: response.status });
        }
        return responseData;
        }
        });
    }

    /**
     * 获取文件信息
     * @param {Object} responseData - Telegram API响应数据
     * @returns {Object|null} 文件信息对象或null
     */
    getFileInfo(responseData) {
        const getFileDetails = (file) => ({
            file_id: file.file_id,
            file_name: file.file_name || file.file_unique_id,
            file_size: file.file_size,
        });

        try {
            if (!responseData.ok) {
                console.error('Telegram API error:', responseData.description);
                return null;
            }

            if (responseData.result.photo) {
                const largestPhoto = responseData.result.photo.reduce((prev, current) =>
                    (prev.file_size > current.file_size) ? prev : current
                );
                return getFileDetails(largestPhoto);
            }

            if (responseData.result.video) {
                return getFileDetails(responseData.result.video);
            }

            if (responseData.result.audio) {
                return getFileDetails(responseData.result.audio);
            }

            if (responseData.result.document) {
                return getFileDetails(responseData.result.document);
            }

            return null;
        } catch (error) {
            console.error('Error parsing Telegram response:', error.message);
            return null;
        }
    }

    /**
     * 获取文件路径
     * @param {string} fileId - 文件ID
     * @returns {Promise<string|null>} 文件路径或null
     */
    async getFilePath(fileId, options = {}) {
        try {
            const url = `${this.baseURL}/getFile?file_id=${fileId}`;
            const response = await fetchUpstream(url, {
                method: 'GET',
                headers: this.defaultHeaders,
                signal: options.signal,
            });

            const responseData = await response.json();
            if (responseData.ok) {
                return responseData.result.file_path;
            } else {
                return null;
            }
        } catch (error) {
            options.signal?.throwIfAborted();
            console.error('Error getting file path:', error.message);
            return null;
        }
    }

    /**
     * 获取文件内容
     * @param {string} fileId - 文件ID
     * @returns {Promise<Response>} 文件响应
     */
    async getFileContent(fileId, options = {}) {
        const filePath = await this.getFilePath(fileId, options);
        if (!filePath) {
            throw new Error(`File path not found for fileId: ${fileId}`);
        }

        const fullURL = `${this.fileDomain}/file/bot${this.botToken}/${filePath}`;
        const response = await fetchUpstream(fullURL, {
            headers: this.defaultHeaders,
            signal: options.signal
        });

        return response;
    }

}
