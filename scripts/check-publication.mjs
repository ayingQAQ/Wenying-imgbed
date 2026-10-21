import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

// Scan tracked and new publishable files. Never print a matched secret value.
const files = process.argv.includes('--assets')
    ? walk('frontend-dist')
    : [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}
const forbiddenPath = /(^|\/)(?:tests?|__tests__|coverage|playwright-report|test-results|\.codex-tmp|\.playwright-mcp|node_modules|backups|logs|data)(\/|$)|(?:\.(?:test|spec)\.|_test\.)|\.map(?:\.gz)?$|\.(?:sqlite(?:-\w+)?|log|pem|key|p12|pfx)$/i;
const rules = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['access token', /\b(?:hf_|gh[pousr]_)[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/],
    ['bot token', /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/],
    ['personal registration', /萌ICP备\d+号|icp\.gov\.moe\/[^ "'<>]*keyword=\d+/],
    ['personal Windows path', /\b[A-Z]:[\\/](?:Users|Desktop|Downloads)[\\/]/i],
    ['credential URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/i],
];
let failures = 0;
for (const name of files) {
    if (!statSync(name, { throwIfNoEntry: false })?.isFile()) continue;
    const normalized = name.replaceAll('\\', '/');
    const envFile = /(^|\/)\.env(?:\.|$)/.test(normalized) && !normalized.endsWith('.example');
    const deploymentFile = /^deploy\/worker\/(?:dual-backend\.json|wrangler(?:\.[^.]+)?\.toml)$/.test(normalized);
    if (forbiddenPath.test(normalized) || envFile || deploymentFile) {
        console.error(`Excluded publication path: ${normalized}`); failures++; continue;
    }
    let bytes = readFileSync(name);
    if (name.endsWith('.gz')) bytes = gunzipSync(bytes);
    if (bytes.includes(0)) continue;
    const content = bytes.toString('utf8');
    for (const [label, rule] of rules) {
        const match = rule.exec(content);
        if (!match) continue;
        const line = content.slice(0, match.index).split('\n').length;
        console.error(`${normalized}:${line}: ${label} (value redacted)`); failures++;
    }
}
if (failures) process.exitCode = 1;
else console.log(`Publication policy passed for ${files.length} files.`);
