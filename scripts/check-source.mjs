import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}
const files = ['functions', 'deploy/server', 'deploy/worker', 'scripts'].flatMap(walk)
    .filter(file => /\.(?:js|mjs)$/.test(file));
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`JavaScript syntax passed for ${files.length} backend/build files.`);
