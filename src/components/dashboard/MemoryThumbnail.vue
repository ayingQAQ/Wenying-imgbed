<template>
    <div ref="host" class="memory-thumbnail" :aria-busy="loading">
        <canvas v-show="ready" ref="canvas" aria-label="图片缩略图"></canvas>
        <span v-if="!ready" class="thumbnail-state">{{ error ? '加载失败' : '…' }}</span>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { enqueueThumbnail } from '@/utils/dashboard/thumbnailQueue';

const props = defineProps({ src: { type: String, required: true } });
const host = ref(null);
const canvas = ref(null);
const ready = ref(false);
const loading = ref(false);
const error = ref(false);
let visible = false;
let observer;
let controller;

async function decodeThumbnail(blob, signal) {
    try {
        const bitmap = await createImageBitmap(blob, { resizeWidth: 480, resizeQuality: 'low' });
        return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch (cause) {
        if (signal.aborted) throw cause;
        // SVG and browsers without bitmap decoding use a temporary image only.
        const url = URL.createObjectURL(blob);
        const image = new Image();
        const close = () => { image.removeAttribute('src'); URL.revokeObjectURL(url); };
        try {
            await new Promise((resolve, reject) => {
                const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
                const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
                image.onload = () => { cleanup(); resolve(); };
                image.onerror = () => { cleanup(); reject(new Error('Image decode failed')); };
                signal.addEventListener('abort', abort, { once: true });
                image.src = url;
            });
            return { image, width: image.naturalWidth, height: image.naturalHeight, close };
        } catch (error) { close(); throw error; }
    }
}

function release() {
    controller?.abort();
    controller = null;
    ready.value = false;
    loading.value = false;
    if (canvas.value) { canvas.value.width = 1; canvas.value.height = 1; }
}

async function load() {
    release();
    if (!visible || !props.src) return;
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = false;
    const source = props.src;
    try {
        await enqueueThumbnail(async () => {
            if (request.signal.aborted) return;
            const response = await fetch(source, { signal: request.signal, credentials: 'same-origin' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            if (request.signal.aborted) return;
            // Only the small bitmap is retained; originals are never attached to the DOM.
            const bitmap = await decodeThumbnail(blob, request.signal);
            try {
                if (request.signal.aborted || !canvas.value) return;
                const scale = Math.min(1, 480 / bitmap.width, 480 / bitmap.height);
                canvas.value.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.value.height = Math.max(1, Math.round(bitmap.height * scale));
                canvas.value.getContext('2d').drawImage(bitmap.image, 0, 0, canvas.value.width, canvas.value.height);
                ready.value = true;
            } finally { bitmap.close(); }
        }, request.signal);
    } catch (cause) {
        if (!request.signal.aborted) error.value = true;
    } finally {
        if (controller === request) loading.value = false;
    }
}

onMounted(() => {
    observer = new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible) load();
        else release();
    }, { rootMargin: '100px' });
    observer.observe(host.value);
});
watch(() => props.src, load);
onBeforeUnmount(() => { observer?.disconnect(); release(); });
</script>

<style scoped>
.memory-thumbnail { position: relative; width: 100%; height: 100%; overflow: hidden; }
canvas { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumbnail-state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--el-text-color-secondary); font-size: 13px; }
</style>
