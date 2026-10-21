import { Readable } from 'node:stream';
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand,
    ListObjectsV2Command, CreateMultipartUploadCommand, UploadPartCommand,
    CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';

const fields = {contentType:'ContentType',contentLanguage:'ContentLanguage',contentDisposition:'ContentDisposition',contentEncoding:'ContentEncoding',cacheControl:'CacheControl'};
const etag = value => (value || '').replace(/^"|"$/g, '');
export class S3R2Storage {
    constructor(env, client) {
        if (!env.R2_S3_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw new Error('Direct R2 S3 configuration is incomplete');
        this.bucket = env.R2_S3_BUCKET;
        this.client = client || new S3Client({endpoint:env.R2_S3_ENDPOINT,region:'auto',forcePathStyle:true,
            credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY}});
    }
    async send(Command, input) { return this.client.send(new Command({Bucket:this.bucket,...input}), {abortSignal:AbortSignal.timeout(120000)}); }
    metadata(key, data) {
        const httpMetadata = Object.fromEntries(Object.entries(fields).filter(([,v])=>data[v]!==undefined).map(([k,v])=>[k,data[v]]));
        return {key,size:data.ContentLength,etag:etag(data.ETag),uploaded:data.LastModified,customMetadata:data.Metadata || {},httpMetadata,
            writeHttpMetadata(headers) {for(const [k,v] of Object.entries(httpMetadata)) headers.set(k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),v);}};
    }
    async head(key) {
        try {return this.metadata(key,await this.send(HeadObjectCommand,{Key:key}));}
        catch(e){if(e.$metadata?.httpStatusCode===404)return null;throw e;}
    }
    async get(key, options={}) {
        const r=options.range;
        const Range=r ? r.suffix!==undefined ? `bytes=-${r.suffix}` : `bytes=${r.offset||0}-${r.length!==undefined?(r.offset||0)+r.length-1:''}` : undefined;
        try {
            const data=await this.send(GetObjectCommand,{Key:key,Range,IfMatch:options.onlyIf?.etagMatches});
            // A cancellation can emit a late Node error after the Web adapter
            // detaches. Keep it handled; the Web stream still reports read errors.
            data.Body.on?.('error', () => {});
            const object=this.metadata(key,data);object.body=data.Body.transformToWebStream();
            const match=/bytes (\d+)-(\d+)\/(\d+)/.exec(data.ContentRange||'');
            if(match){object.range={offset:Number(match[1]),length:Number(match[2])-Number(match[1])+1};object.size=Number(match[3]);}
            return object;
        }catch(e){if([404,412].includes(e.$metadata?.httpStatusCode))return null;throw e;}
    }
    async put(key, value, options={}) {
        const Body=value instanceof Blob ? Readable.fromWeb(value.stream()) : value instanceof ReadableStream ? Readable.fromWeb(value) : value;
        Body?.on?.('error', () => {});
        const meta=Object.fromEntries(Object.entries(fields).filter(([k])=>options.httpMetadata?.[k]!==undefined).map(([k,v])=>[v,options.httpMetadata[k]]));
        try {await this.send(PutObjectCommand,{Key:key,Body,ContentLength:value instanceof Blob?value.size:undefined,...meta,Metadata:options.customMetadata,
            IfMatch:options.onlyIf?.etagMatches,IfNoneMatch:options.onlyIf?.etagDoesNotMatch});return this.head(key);}
        catch(e){Body?.destroy?.();if(e.$metadata?.httpStatusCode===412)return null;throw e;}
    }
    async delete(key) {for(const Key of Array.isArray(key)?key:[key])await this.send(DeleteObjectCommand,{Key});}
    async list(options={}) {
        const data=await this.send(ListObjectsV2Command,{Prefix:options.prefix,MaxKeys:options.limit||1000,ContinuationToken:options.cursor,Delimiter:options.delimiter});
        return {objects:(data.Contents||[]).map(o=>({key:o.Key,size:o.Size,etag:etag(o.ETag),uploaded:o.LastModified})),
            truncated:Boolean(data.IsTruncated),cursor:data.NextContinuationToken,delimitedPrefixes:(data.CommonPrefixes||[]).map(p=>p.Prefix)};
    }
    async createMultipartUpload(key, options={}) {
        const meta=Object.fromEntries(Object.entries(fields).filter(([k])=>options.httpMetadata?.[k]!==undefined).map(([k,v])=>[v,options.httpMetadata[k]]));
        const data=await this.send(CreateMultipartUploadCommand,{Key:key,...meta,Metadata:options.customMetadata});return this.resumeMultipartUpload(key,data.UploadId);
    }
    resumeMultipartUpload(key,uploadId) {
        return {key,uploadId,
            uploadPart:async(partNumber,data)=>{const r=await this.send(UploadPartCommand,{Key:key,UploadId:uploadId,PartNumber:partNumber,ContentLength:data instanceof Blob?data.size:undefined,Body:data instanceof Blob?Readable.fromWeb(data.stream()):data instanceof ReadableStream?Readable.fromWeb(data):data});return {partNumber,etag:etag(r.ETag)};},
            complete:async(parts)=>{await this.send(CompleteMultipartUploadCommand,{Key:key,UploadId:uploadId,MultipartUpload:{Parts:parts.map(p=>({PartNumber:p.partNumber,ETag:p.etag}))}});return this.head(key);},
            abort:()=>this.send(AbortMultipartUploadCommand,{Key:key,UploadId:uploadId})};
    }
}
