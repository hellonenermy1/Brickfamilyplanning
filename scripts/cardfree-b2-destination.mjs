// Staged off-platform capability only. No CLI, default fetch, env credentials,
// key/bucket creation, scheduler, production installer or automatic retries.
import {createHash} from 'node:crypto';
import {openBackup,validateBackupContext,MAX_PACKAGE_BYTES} from './cardfree-backup-package.mjs';
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const digest=(bytes,alg='sha256')=>createHash(alg).update(bytes).digest('hex');
const token=v=>typeof v==='string'&&/^[\x21-\x7e]{1,8192}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{6,200}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=code=>{throw Error(code);};
export function validateB2DestinationPin(p){
 if(!exact(p,['format','accountId','bucketId','bucketName','apiOrigin','downloadOrigin','namePrefix'])||p.format!=='brick-b2-destination-pin-v1'||!id(p.accountId)||!id(p.bucketId)||typeof p.bucketName!=='string'||! /^(?!b2-)[A-Za-z0-9-]{6,63}$/.test(p.bucketName)||!/^https:\/\/api[0-9]{3,6}\.backblazeb2\.com$/.test(p.apiOrigin)||!/^https:\/\/f[0-9]{3,6}\.backblazeb2\.com$/.test(p.downloadOrigin)||p.namePrefix!=='brick-recovery/')fail('B2_PIN_INVALID');
 return Object.freeze(Object.fromEntries(['format','accountId','bucketId','bucketName','apiOrigin','downloadOrigin','namePrefix'].map(k=>[k,p[k]])));
}
export function createStagedB2ArchiveDestination({pin:input,authorization,fetcher,timeoutMs=15000}={}){
 const pin=validateB2DestinationPin(input),api=authorization?.apiInfo?.storageApi,allowed=api?.allowed;
 if(typeof fetcher!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<5||timeoutMs>30000)fail('B2_CONFIGURATION_INVALID');
 // Reject account-wide, multi-bucket, delete/share/admin and unprefixed keys.
 if(authorization?.accountId!==pin.accountId||!token(authorization?.authorizationToken)||api?.apiUrl!==pin.apiOrigin||api?.downloadUrl!==pin.downloadOrigin||!Array.isArray(allowed?.buckets)||allowed.buckets.length!==1||allowed.buckets[0]?.id!==pin.bucketId||allowed.buckets[0]?.name!==pin.bucketName||allowed.namePrefix!==pin.namePrefix||!Array.isArray(allowed.capabilities)||[...allowed.capabilities].sort().join(',')!=='listBuckets,readFiles,writeFiles')fail('B2_AUTHORIZATION_SCOPE_INVALID');
 const accountToken=authorization.authorizationToken,pinSha256=digest(JSON.stringify(pin));
 const apiUrl=name=>pin.apiOrigin+'/b2api/v4/'+name;
 function operation(){
  const abort=new AbortController(),deadline=performance.now()+timeoutMs;let expired=false;
  const timer=setTimeout(()=>{expired=true;abort.abort();},timeoutMs);
  async function bounded(work){let t;try{const left=deadline-performance.now();if(left<=0)fail('B2_TIMEOUT');const value=await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{t=setTimeout(()=>reject(Error('B2_TIMEOUT')),left);})]);if(expired||performance.now()>=deadline)fail('B2_TIMEOUT');return value;}finally{clearTimeout(t);}}
  async function bytes(response,max){
   const size=response.headers.get('content-length');if(size!==null&&(!/^(0|[1-9][0-9]*)$/.test(size)||Number(size)>max))fail('B2_RESPONSE_SIZE_INVALID');
   if(!response.body)fail('B2_RESPONSE_BODY_INVALID');const reader=response.body.getReader(),parts=[];let length=0;
   try{for(;;){const next=await bounded(()=>reader.read());if(next.done)break;if(!(next.value instanceof Uint8Array))fail('B2_RESPONSE_BODY_INVALID');length+=next.value.byteLength;if(length>max)fail('B2_RESPONSE_SIZE_INVALID');parts.push(Buffer.from(next.value));}if(size!==null&&length!==Number(size))fail('B2_RESPONSE_SIZE_INVALID');return Buffer.concat(parts,length);}finally{try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}reader.releaseLock();}
  }
  async function request(url,init,max,validateHeaders){
   let response;try{
    response=await bounded(()=>fetcher(url,{...init,redirect:'manual',credentials:'omit',cache:'no-store',signal:abort.signal}));
    if(!(response instanceof Response)||response.redirected||response.url!==url||response.status!==200)fail('B2_HTTP_UNVERIFIED');
    const encoding=response.headers.get('content-encoding');if(encoding&&encoding!=='identity')fail('B2_RESPONSE_ENCODING_INVALID');
    validateHeaders?.(response.headers);return await bytes(response,max);
   }finally{if(response?.body&&!response.body.locked)try{Promise.resolve(response.body.cancel()).catch(()=>{});}catch{}}
  }
  async function json(url,init){const b=await request(url,init,65536,h=>{if(!/^application\/json(?:\s*;|$)/i.test(h.get('content-type')??''))fail('B2_JSON_UNVERIFIED');});try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}catch{fail('B2_JSON_UNVERIFIED');}finally{b.fill(0);}}
  async function privateBucket(){const body=await json(apiUrl('b2_list_buckets'),{method:'POST',headers:{Authorization:accountToken,'Content-Type':'application/json'},body:JSON.stringify({accountId:pin.accountId,bucketId:pin.bucketId})});if(!Array.isArray(body?.buckets)||body.buckets.length!==1)fail('B2_PRIVATE_BUCKET_UNVERIFIED');const b=body.buckets[0];if(b.accountId!==pin.accountId||b.bucketId!==pin.bucketId||b.bucketName!==pin.bucketName||b.bucketType!=='allPrivate')fail('B2_PRIVATE_BUCKET_UNVERIFIED');}
  async function download(receipt){
   const url=pin.downloadOrigin+'/b2api/v4/b2_download_file_by_id?fileId='+encodeURIComponent(receipt.fileId);
   const b=await request(url,{method:'GET',headers:{Authorization:accountToken}},receipt.bytes,h=>{if(h.get('x-bz-file-id')!==receipt.fileId||h.get('x-bz-file-name')!==encodeURIComponent(receipt.fileName)||h.get('x-bz-content-sha1')!==receipt.contentSha1||h.get('content-type')!=='application/octet-stream'||h.get('content-length')!==String(receipt.bytes))fail('B2_READBACK_IDENTITY_INVALID');});
   if(b.length!==receipt.bytes||digest(b)!==receipt.archiveSha256||digest(b,'sha1')!==receipt.contentSha1){b.fill(0);fail('B2_READBACK_HASH_INVALID');}return b;
  }
  return{json,privateBucket,download,close(){clearTimeout(timer);abort.abort();}};
 }
 function validateReceipt(r){if(!exact(r,['format','pinSha256','fileId','fileName','bytes','archiveSha256','contentSha1'])||r.format!=='brick-b2-archive-receipt-v1'||r.pinSha256!==pinSha256||!id(r.fileId)||!hash(r.archiveSha256)||typeof r.contentSha1!=='string'||!/^[a-f0-9]{40}$/.test(r.contentSha1)||!Number.isSafeInteger(r.bytes)||r.bytes<=36||r.bytes>MAX_PACKAGE_BYTES||typeof r.fileName!=='string'||!new RegExp('^brick-recovery/[a-f0-9]{32}-'+r.archiveSha256+'\\.brick$').test(r.fileName))fail('B2_RECEIPT_INVALID');return {...r};}
 return Object.freeze({
  async inspect(){const op=operation();try{await op.privateBucket();return{format:'brick-b2-inspection-v1',privateBucketObserved:true,destinationQualified:false,cardOrFreeTierVerified:false};}catch{fail('B2_INSPECTION_UNVERIFIED');}finally{op.close();}},
  async publish({archive,key,context}={}){
   let copy,opened,readback,op,uploadAttempted=false,phase='LOCAL_AUTHENTICATION';
   try{
    validateBackupContext(context);context={...context};if(!(archive instanceof Uint8Array)||archive.byteLength<=36||archive.byteLength>MAX_PACKAGE_BYTES)fail('B2_ARCHIVE_INVALID');copy=Buffer.from(archive);opened=openBackup(copy,key,context);opened.body.fill(0);opened=null;
    const archiveSha256=digest(copy),contentSha1=digest(copy,'sha1'),fileName=pin.namePrefix+context.backupId+'-'+archiveSha256+'.brick';
    op=operation();phase='PRIVATE_BUCKET';await op.privateBucket();phase='UPLOAD_URL';
    const grant=await op.json(apiUrl('b2_get_upload_url')+'?bucketId='+encodeURIComponent(pin.bucketId),{method:'GET',headers:{Authorization:accountToken}});
    let u;try{u=new URL(grant?.uploadUrl);}catch{fail('B2_UPLOAD_URL_INVALID');}
    const pathBucket=u.pathname.split('/')[4],queryBucket=u.searchParams.get('bucket');
    if(grant.bucketId!==pin.bucketId||!token(grant.authorizationToken)||u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!/^pod-[0-9]+(?:-[0-9]+)+\.backblaze\.com$/.test(u.hostname)||!/^\/b2api\/v4\/b2_upload_file(?:\/|$)/.test(u.pathname)||!((pathBucket===pin.bucketId||queryBucket===pin.bucketId)&&(!pathBucket||pathBucket===pin.bucketId)&&(!queryBucket||queryBucket===pin.bucketId)&&u.searchParams.getAll('bucket').length<=1)||grant.uploadUrl!==u.href)fail('B2_UPLOAD_URL_INVALID');
    phase='UPLOAD';uploadAttempted=true;
    const uploaded=await op.json(u.href,{method:'POST',headers:{Authorization:grant.authorizationToken,'Content-Type':'application/octet-stream','Content-Length':String(copy.length),'X-Bz-File-Name':encodeURIComponent(fileName),'X-Bz-Content-Sha1':contentSha1},body:copy});
    if(!id(uploaded?.fileId)||uploaded.accountId!==pin.accountId||uploaded.bucketId!==pin.bucketId||uploaded.fileName!==fileName||uploaded.contentLength!==copy.length||uploaded.contentSha1!==contentSha1||uploaded.contentType!=='application/octet-stream'||uploaded.action!=='upload')fail('B2_UPLOAD_ACK_INVALID');
    const receipt={format:'brick-b2-archive-receipt-v1',pinSha256,fileId:uploaded.fileId,fileName,bytes:copy.length,archiveSha256,contentSha1};
    phase='READBACK';readback=await op.download(receipt);opened=openBackup(readback,key,context);opened.body.fill(0);opened=null;
    phase='PRIVATE_BUCKET_RECHECK';await op.privateBucket();
    return{format:'brick-b2-publication-v1',status:'VERIFIED_STAGED_READBACK',uploadAttempted:true,uploadMayExist:true,authenticationVerified:true,readbackVerified:true,destinationQualified:false,receipt};
   }catch{return{format:'brick-b2-publication-v1',status:'UNVERIFIED',code:'B2_PUBLICATION_UNVERIFIED',phase,uploadAttempted,uploadMayExist:uploadAttempted,authenticationVerified:false,readbackVerified:false,destinationQualified:false};}
   finally{op?.close();copy?.fill(0);readback?.fill(0);opened?.body?.fill(0);}
  },
  async readVerified(input){const receipt=validateReceipt(input),op=operation();try{await op.privateBucket();const b=await op.download(receipt);try{await op.privateBucket();return b;}catch{b.fill(0);fail('B2_READ_UNVERIFIED');}}catch{fail('B2_READ_UNVERIFIED');}finally{op.close();}}
 });
}
