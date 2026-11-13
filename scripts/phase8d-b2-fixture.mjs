// Synthetic disk-backed provider capability only. No global fetch or actual B2.
// Directory and all identities/credentials must remain test-only.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomBytes} from 'node:crypto';
import {createStagedB2ArchiveDestination} from './cardfree-b2-destination.mjs';
export function syntheticB2Destination(directory){
 fs.mkdirSync(directory,{recursive:true,mode:0o700});const indexPath=path.join(directory,'synthetic-index.json');
 const pin={format:'brick-b2-destination-pin-v1',accountId:'synthetic-account',bucketId:'synthetic-bucket',bucketName:'synthetic-brick-recovery',apiOrigin:'https://api001.backblazeb2.com',downloadOrigin:'https://f001.backblazeb2.com',namePrefix:'brick-recovery/'};
 const auth={accountId:pin.accountId,authorizationToken:'synthetic-account-token',apiInfo:{storageApi:{apiUrl:pin.apiOrigin,downloadUrl:pin.downloadOrigin,allowed:{buckets:[{id:pin.bucketId,name:pin.bucketName}],capabilities:['listBuckets','readFiles','writeFiles'],namePrefix:pin.namePrefix}}}};
 const calls=[];
 function response(url,body,headers={'content-type':'application/json'}){const r=new Response(body,{headers});Object.defineProperty(r,'url',{value:url});return r;}
 const adapter=createStagedB2ArchiveDestination({pin,authorization:auth,fetcher:async(url,init)=>{
  calls.push({method:init.method,path:new URL(url).pathname});
  if(init.redirect!=='manual')throw Error('synthetic fixture requires manual redirect');
  if(url===pin.apiOrigin+'/b2api/v4/b2_list_buckets'&&init.method==='POST'&&init.headers.Authorization===auth.authorizationToken){const p=JSON.parse(init.body);if(p.accountId!==pin.accountId||p.bucketId!==pin.bucketId)throw Error('synthetic bucket pin');return response(url,JSON.stringify({buckets:[{...p,bucketName:pin.bucketName,bucketType:'allPrivate'}]}));}
  if(url===pin.apiOrigin+'/b2api/v4/b2_get_upload_url?bucketId='+pin.bucketId&&init.method==='GET'&&init.headers.Authorization===auth.authorizationToken)return response(url,JSON.stringify({bucketId:pin.bucketId,authorizationToken:'synthetic-upload-token',uploadUrl:'https://pod-000-1005-03.backblaze.com/b2api/v4/b2_upload_file/'+pin.bucketId+'/synthetic'}));
  if(url==='https://pod-000-1005-03.backblaze.com/b2api/v4/b2_upload_file/'+pin.bucketId+'/synthetic'&&init.method==='POST'&&init.headers.Authorization==='synthetic-upload-token'){
   const body=Buffer.from(init.body),fileId='synthetic-file-'+randomBytes(16).toString('hex'),contentSha1=createHash('sha1').update(body).digest('hex');if(init.headers['X-Bz-Content-Sha1']!==contentSha1||init.headers['Content-Length']!==String(body.length))throw Error('synthetic upload integrity');
   const value={accountId:pin.accountId,bucketId:pin.bucketId,fileId,fileName:decodeURIComponent(init.headers['X-Bz-File-Name']),contentLength:body.length,contentSha1,contentType:'application/octet-stream',action:'upload'};
   fs.writeFileSync(path.join(directory,fileId),body,{mode:0o600,flag:'wx'});const index=fs.existsSync(indexPath)?JSON.parse(fs.readFileSync(indexPath,'utf8')):{};index[fileId]=value;fs.writeFileSync(indexPath,JSON.stringify(index),{mode:0o600});body.fill(0);return response(url,JSON.stringify(value));
  }
  if(url.startsWith(pin.downloadOrigin+'/b2api/v4/b2_download_file_by_id?fileId=')&&init.method==='GET'&&init.headers.Authorization===auth.authorizationToken){const fileId=new URL(url).searchParams.get('fileId');if(!/^synthetic-file-[a-f0-9]{32}$/.test(fileId))throw Error('synthetic file pin');const value=JSON.parse(fs.readFileSync(indexPath,'utf8'))[fileId];if(!value)throw Error('synthetic file absent');const body=fs.readFileSync(path.join(directory,fileId));return response(url,body,{'content-type':'application/octet-stream','content-length':String(body.length),'x-bz-file-id':fileId,'x-bz-file-name':encodeURIComponent(value.fileName),'x-bz-content-sha1':value.contentSha1});}
  throw Error('synthetic fixture forbids unrecognized network capability');
 }});
 return{adapter,calls,pin:Object.freeze({...pin})};
}
