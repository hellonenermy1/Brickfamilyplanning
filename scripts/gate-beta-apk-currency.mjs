// Prevent launch against an APK that changed concurrently in another work session.
const token=process.env.GH_TOKEN,repo=process.env.GITHUB_REPOSITORY;
if(!token||repo!=='hellonenermy1/Brickfamilyplanning')throw Error('Repository-scoped Actions credential required');
const get=async p=>{const r=await fetch('https://api.github.com/repos/'+repo+p,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('APK currency metadata HTTP '+r.status);return r.json();};
const source='dda193f79598fec0d814883b13fb3c16f5021817';
const ref=await get('/git/ref/heads/fix/v1-p8d-phase1-android-20261106');
const diff=await get('/compare/'+source+'...'+ref.object.sha);
if(!['ahead','identical'].includes(diff.status)||!Array.isArray(diff.files)||diff.files.length>=300||diff.files.some(x=>x.filename.startsWith('app/')||['build.gradle.kts','settings.gradle.kts','gradle.properties'].includes(x.filename)))throw Error('A newer APK source revision exists. Validate its APK/escape/reboot CI and update release pin, archive/checksum, install instructions and availability before beta deployment.');
const run=await get('/actions/runs/42220884796');
if(run.conclusion!=='success'||run.head_sha!==source)throw Error('Pinned Android v12 signed build has not passed on exact release source');
const {artifacts}=await get('/actions/runs/42220884796/artifacts?per_page=100');
if(!Array.isArray(artifacts)||!artifacts.some(a=>a.id===13502684166&&!a.expired&&a.name==='brick-beta-apk-'+source))throw Error('Pinned signed APK artifact is missing or expired');
console.log('APK v12 source, signed build and pinned artifact verified; newer runtime edits are rejected');
