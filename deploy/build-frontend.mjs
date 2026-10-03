import {cp,rm} from 'node:fs/promises';
const output=new URL('../frontend-dist/',import.meta.url);
await rm(output,{recursive:true,force:true});
await cp(new URL('../frontend/dist/',import.meta.url),output,{recursive:true});
console.log('Frontend copied to frontend-dist');
