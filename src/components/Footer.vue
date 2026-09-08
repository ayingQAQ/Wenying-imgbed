<template>
    <div class="page-footer" v-if="!disableFooter">
        <p>© 2024-{{ thisYear }} Designed by <span class="footer-name">Wenying</span> for You!</p>
    </div>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
    name: 'Footer',
    computed: {
        ...mapGetters(['userConfig']),
        thisYear() {
            return new Date().getFullYear()
        },
        disableFooter() {
            return this.userConfig?.disableFooter || false
        }
    }
}
</script>

<style scoped>
.page-footer {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100vw;
    color: var(--page-footer-text-color);
    font-size: large;
    font-family: 'Pacifico', 'Noto Sans SC', sans-serif;
    user-select: none;
}
@media (max-width: 768px) {
    .page-footer {
        font-size: small;
    }
}
.footer-name {
    color: var(--page-footer-name-color);
    font-weight: bold;
}
</style>
