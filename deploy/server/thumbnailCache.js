import { mkdir, readdir, stat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Derivatives only; originals and storage objects are never modified.
export class ThumbnailCache {
    constructor(directory, maxBytes = 256 * 1024 * 1024, maxEntryBytes = 1024 * 1024, maxAgeMs = Infinity, persistent = false) {
        this.directory = directory;
        this.maxBytes = maxBytes;
        this.maxEntryBytes = maxEntryBytes;
        this.maxAgeMs = maxAgeMs;
        this.persistent = persistent;
        this.entries = new Map();
        this.bytes = 0;
        this.ready = this.initialize();
    }
    name(key) { return createHash('sha256').update(key).digest('hex') + '.webp'; }
    async initialize() {
        await mkdir(this.directory, {recursive:true,mode:0o700});
        for (const name of await readdir(this.directory)) {
            if (!/^[a-f0-9]{64}\.webp$/.test(name)) continue;
            const info = await stat(join(this.directory,name));
            this.entries.set(name,{size:info.size,time:info.mtimeMs,born:info.mtimeMs});this.bytes += info.size;
        }
        await this.trim();
    }
    async get(key) {
        await this.ready;
        const name = this.name(key),entry = this.entries.get(name);
        if (!entry) return null;
        if (Date.now() - entry.born > this.maxAgeMs) {
            this.entries.delete(name);this.bytes -= entry.size;
            await unlink(join(this.directory,name)).catch(error => { if(error.code !== 'ENOENT') throw error; });
            return null;
        }
        try {
            const body = await readFile(join(this.directory,name));entry.time = Date.now();
            return new Response(body,{headers:{'Content-Type':'image/webp','Content-Length':String(body.length),'Cache-Control':'private, no-store','X-Thumbnail-Cache':'HIT'}});
        } catch (error) {
            if(error.code!=='ENOENT')throw error;
            this.entries.delete(name);this.bytes-=entry.size;return null;
        }
    }
    async put(key, body) {
        await this.ready;
        if(body.length>this.maxEntryBytes||body.length>this.maxBytes)return;
        const name=this.name(key),path=join(this.directory,name),temporary=path+'.'+randomUUID();
        if (this.persistent && this.bytes + body.length - (this.entries.get(name)?.size || 0) > this.maxBytes) {
            throw Object.assign(new Error('Thumbnail storage budget reached; existing thumbnails retained'), { statusCode: 507 });
        }
        await writeFile(temporary,body,{mode:0o600});await rename(temporary,path);
        this.bytes -= this.entries.get(name)?.size||0;
        this.entries.set(name,{size:body.length,time:Date.now(),born:Date.now()});this.bytes+=body.length;
        await this.trim();
    }
    async trim() {
        if (this.persistent) return;
        for(const [name,entry] of [...this.entries].sort((a,b)=>a[1].time-b[1].time)) {
            if(this.bytes<=this.maxBytes)break;
            this.entries.delete(name);this.bytes-=entry.size;
            await unlink(join(this.directory,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});
        }
    }
    async delete(key) {
        await this.ready;
        const name = this.name(key), entry = this.entries.get(name);
        if (!entry) return;
        await unlink(join(this.directory, name)).catch(error => { if(error.code !== 'ENOENT') throw error; });
        this.entries.delete(name); this.bytes -= entry.size;
    }
}
