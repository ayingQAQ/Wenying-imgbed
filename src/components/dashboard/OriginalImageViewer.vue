<template>
    <el-image-viewer :url-list="displayUrls" :initial-index="initialIndex" teleported
        @switch="loadImage" @close="$emit('close')">
        <div v-if="loading || error" class="original-preview-status" role="status">
            <span v-if="loading">正在加载原图…</span>
            <button v-else @click="loadImage(activeIndex)">原图加载失败，点击重试</button>
        </div>
    </el-image-viewer>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { createOriginalImageLoader } from '@/utils/dashboard/originalImage'

const props = defineProps({ urls: { type: Array, required: true }, initialIndex: { type: Number, default: 0 } })
defineEmits(['close'])
const emptyImage = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
const activeIndex = ref(props.initialIndex)
const currentUrl = ref('')
const loading = ref(false)
const error = ref(false)
const loader = createOriginalImageLoader()
let generation = 0
const displayUrls = computed(() => props.urls.map((_, index) => index === activeIndex.value && currentUrl.value ? currentUrl.value : emptyImage))

async function loadImage(index) {
    currentUrl.value = ''
    activeIndex.value = index
    loading.value = true
    error.value = false
    const request = ++generation
    try {
        const url = await loader.load(props.urls[index])
        if (request === generation) currentUrl.value = url
    } catch (cause) {
        if (request === generation) error.value = true
    } finally {
        if (request === generation) loading.value = false
    }
}

loadImage(props.initialIndex)
onBeforeUnmount(() => { generation++; loader.release() })
</script>

<style scoped>
.original-preview-status { position: absolute; top: 20%; left: 50%; transform: translateX(-50%); color: white; }
.original-preview-status button { padding: 10px 16px; border-radius: 8px; cursor: pointer; }
</style>
