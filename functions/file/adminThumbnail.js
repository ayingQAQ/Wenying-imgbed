import { thumbnailKey } from './uploadThumbnail.js';
export async function adminThumbnail(context, fileId, metadata) {
    if(context.url.searchParams.get('display')!=='thumbnail'||!context.env.THUMBNAIL_CACHE)return null;
    if(context.request.method!=='GET')return new Response('GET required',{status:405});
    if(context.fileAccess?.adminAuthResult?.authorized!==true)return new Response('Unauthorized',{status:401,headers:{'Cache-Control':'no-store'}});
    const key=thumbnailKey(fileId,metadata);
    const cached=await context.env.THUMBNAIL_CACHE.get(key);
    if(cached)return cached;
    const url=new URL(context.request.url);url.searchParams.delete('display');
    const headers=new Headers(context.request.headers);headers.delete('Range');headers.delete('If-None-Match');headers.delete('If-Modified-Since');
    const source=await fetch(new Request(url,{headers,signal:context.request.signal}));
    if(!source.ok||!source.body)return source;
    // Keep the existing transform input budget. Unusually large/unsupported
    // sources use the original path rather than breaking folder previews.
    if(Number(source.headers.get('Content-Length'))>128*1024*1024){
        await source.body.cancel();
        return new Response('Thumbnail source exceeds 128 MiB',{status:413});
    }
    try {
        const output=await context.env.IMAGE_PROCESSOR.transform(source.body,{width:480,height:480,fit:'contain',sourceType:source.headers.get('Content-Type'),outputFormat:'image/webp',signal:context.request.signal,staticThumbnail:true});
        const body=new Uint8Array(await output.arrayBuffer());
        await context.env.THUMBNAIL_CACHE.put(key,body);
        return new Response(body,{headers:{'Content-Type':'image/webp','Content-Length':String(body.length),'Cache-Control':'private, no-store','X-Thumbnail-Cache':'MISS'}});
    }catch(error){
        if(context.request.signal.aborted)throw error;
        // Never substitute a full-size original for a gallery thumbnail.
        // Doing so silently multiplies downloads and blocks the original viewer.
        return new Response('Thumbnail processing failed',{status:error.statusCode||503});
    }
}
