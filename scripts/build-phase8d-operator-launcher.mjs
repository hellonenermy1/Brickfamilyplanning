// Explicit local artifact build only. This never imports/runs an operator or reads a key.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {build} from 'esbuild';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(process.argv.length!==2)throw Error('No build arguments accepted');
const sha=git(['rev-parse','HEAD']);if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Exact checkout required');git(['diff','--quiet','HEAD','--']);
const output=path.join(root,'scripts/.brick-operator-launcher.mjs');
if(git(['ls-files','--others','--exclude-standard','--','src','scripts','schema']).split('\n').filter(x=>x&&x!=='scripts/.brick-operator-launcher.mjs').length)throw Error('Untracked source refuses build');
const result=await build({entryPoints:[path.join(root,'scripts/phase8d-operator-entry.mjs')],bundle:true,format:'esm',platform:'node',target:'node24',external:['./staged-external-writer.mjs'],define:{BRICK_OPERATOR_SOURCE_SHA:JSON.stringify(sha)},write:false});
if(result.outputFiles.length!==1)throw Error('Single output required');const bytes=result.outputFiles[0].contents;
let fd;try{fd=fs.openSync(output,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{if(fd!==undefined)fs.closeSync(fd);}
console.log(JSON.stringify({format:'brick-pinned-operator-build-v1',operatorSourceSha:sha,bundleSha256:createHash('sha256').update(bytes).digest('hex'),path:output,operatorExecuted:false,productionInstalled:false}));
