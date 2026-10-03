<template>
    <div class="page-footer" v-if="!disableFooter">
        <div class="stats-marquee" aria-label="站点统计">
            <div class="stats-track">
                <div v-for="group in 2" :key="group" class="stats-group" aria-hidden="true">
                    <span v-for="(item, index) in marqueeItems" :key="index" class="stats-item">
                        <span class="stats-dot" aria-hidden="true"></span>{{ item }}
                    </span>
                </div>
            </div>
        </div>
        <p>© 2024-{{ thisYear }} Designed by <span class="footer-name">Wenying</span> for You!</p>
    </div>
</template>

<script>
import { mapGetters } from 'vuex'
import axios from '@/utils/axios'

export default {
    name: 'Footer',
    data() {
        return {
            siteStats: { visits: 0, images: 0 },
            statsRefreshTimer: null
        }
    },
    computed: {
        ...mapGetters(['userConfig']),
        thisYear() {
            return new Date().getFullYear()
        },
        disableFooter() {
            return this.userConfig?.disableFooter || false
        },
        marqueeItems() {
            const items = [
                `Wenying ImgHub 已迎来 ${this.siteStats.visits.toLocaleString()} 人次`,
                `累计托管 ${this.siteStats.images.toLocaleString()} 张图片`
            ]
            return items
        }
    },
    mounted() {
        this.loadSiteStats()
        this.statsRefreshTimer = window.setInterval(this.refreshSiteStats, 10000)
        window.addEventListener('focus', this.refreshSiteStats)
    },
    beforeUnmount() {
        window.clearInterval(this.statsRefreshTimer)
        window.removeEventListener('focus', this.refreshSiteStats)
    },
    methods: {
        applySiteStats(data) {
            this.siteStats = {
                visits: Number(data?.visits) || 0,
                images: Number(data?.images) || 0
            }
        },
        async loadSiteStats() {
            try {
                const response = await axios.post('/api/siteStats')
                this.applySiteStats(response.data)
            } catch (error) {
                console.warn('Failed to load site stats:', error)
            }
        },
        async refreshSiteStats() {
            try {
                const response = await axios.get('/api/siteStats')
                this.applySiteStats(response.data)
            } catch (error) {
                console.warn('Failed to refresh site stats:', error)
            }
        }
    }
}
</script>

<style scoped>
.page-footer {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100vw;
    color: var(--page-footer-text-color);
    font-size: large;
    font-family: 'Pacifico', 'Noto Sans SC', sans-serif;
    user-select: none;
}
.stats-marquee {
    width: min(920px, calc(100vw - 32px));
    overflow: hidden;
    margin: 0 auto 14px;
    font-family: Arial, 'Noto Sans SC', sans-serif;
    mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
}
.stats-track {
    display: flex;
    width: max-content;
    animation: footer-marquee 28s linear infinite;
}
.stats-group {
    display: flex;
    justify-content: space-around;
    gap: 12px;
    width: min(920px, calc(100vw - 32px));
    flex: 0 0 auto;
    box-sizing: border-box;
    padding: 0 6px;
}
.stats-track:hover {
    animation-play-state: paused;
}
.stats-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 13px;
    border: 1px solid var(--glass-border);
    border-radius: 999px;
    background: var(--glass-bg);
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
}
.stats-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--primary-color);
}
.page-footer p {
    margin: 0;
}
@keyframes footer-marquee {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
    .stats-track { animation: none; }
}
@media (max-width: 768px) {
    .page-footer {
        font-size: small;
    }
    .stats-marquee { margin-bottom: 10px; }
    .stats-item { padding: 6px 11px; font-size: 11px; }
}
.footer-name {
    color: var(--page-footer-name-color);
    font-weight: bold;
}
</style>
