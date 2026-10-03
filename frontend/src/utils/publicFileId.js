import { sha256 } from 'js-sha256';

export function publicFileId(value) {
    const id = String(value || '');
    if (!id || /^p_[a-f0-9]{64}(?:\.[a-z0-9]{1,10})?$/.test(id)) return id;
    const extension = id.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1]?.toLowerCase();
    return `p_${sha256(id)}${extension ? '.' + extension : ''}`;
}
