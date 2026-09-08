<template>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="1em" height="1em">
        <path v-for="(path, index) in paths" :key="index" :d="path" />
    </svg>
</template>
<script>
const icons = {
    folder: ['M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z'],
    tree: ['M4 3h6v5H4z', 'M14 15h6v5h-6z', 'M7 8v9h7'],
    more: ['M12 4v1', 'M12 11v1', 'M12 18v1'],
};
export default { props: { name: { type: String, default: 'folder' } }, computed: { paths() { return icons[this.name] || icons.folder; } } };
</script>
