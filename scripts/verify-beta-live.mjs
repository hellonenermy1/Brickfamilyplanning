import fs from 'node:fs/promises';
const state=JSON.parse(await fs.readFile('beta-setup-state.json','utf8'));
if(state.sourceGitSha!==process.env.GITHUB_SHA||state.resources.D1_NAME!=='brick-family-beta'||!/^brick-family-beta\.[a-z0-9-]+\.workers\.dev$/.test(state.workerHost))throw Error('Beta deployment provenance mismatch');
const origin='https://'+state.workerHost,checks=[];
for(const route of ['/parent','/parent/beta/download/apk','/parent/beta/download/manifest','/parent/api/device/beta-unpaired/beta/status']){
 const r=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 const protectedRoute=r.status===403||(r.status===302&&new URL(r.headers.get('location')??'',origin).hostname.endsWith('.cloudflareaccess.com'));
 if(!protectedRoute)throw Error('Parent route is not protected: '+route+' HTTP '+r.status);
 checks.push({route,status:r.status,private:true});
}
const r=await fetch(origin+'/api/device/beta-unpaired/beta/readiness',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(20000)});
if(r.status!==401)throw Error('Unsigned beta device request not denied as expected: HTTP '+r.status);
checks.push({route:'unsigned_beta_device',status:r.status});
await fs.writeFile('beta-live-verification.json',JSON.stringify({sourceSha:process.env.GITHUB_SHA,origin,checks,parentBrowser:'PENDING_ACTUAL_ACCESS_LOGIN',realPhoneReadiness:'PENDING',endurance72h:'NOT_STARTED'},null,2));
console.log('Beta deployed with private parent surface: '+origin+'/parent');
console.log('Parent login, actual signed phone readiness, browser receipt and 72h review remain required.');
