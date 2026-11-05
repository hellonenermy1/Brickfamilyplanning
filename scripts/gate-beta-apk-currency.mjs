// Prevent launch against an APK that changed concurrently in another work session.
const token=process.env.GH_TOKEN,repo=process.env.GITHUB_REPOSITORY;
if(!token||repo!=='hellonenermy1/Brickfamilyplanning')throw Error('Repository-scoped Actions credential required');
const get=async p=>{const r=await fetch('https://api.github.com/repos/'+repo+p,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('APK currency metadata HTTP '+r.status);return r.json();};
const source='fa52547d89929e2032fc8ced4511b79e9bf8a23c';
const ref=await get('/git/ref/heads/beta/apk');
const diff=await get('/compare/'+source+'...'+ref.object.sha);
if(!['ahead','identical'].includes(diff.status)||!Array.isArray(diff.files)||diff.files.length>=300||diff.files.some(x=>x.filename.startsWith('app/')||['build.gradle.kts','settings.gradle.kts','gradle.properties'].includes(x.filename)))throw Error('A newer APK source revision exists. Validate its APK/escape/reboot CI and update release pin, archive/checksum, install instructions and availability before beta deployment.');
console.log('APK runtime matches pinned tested release; audit-only branch commits permitted');
