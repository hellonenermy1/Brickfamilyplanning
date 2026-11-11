// Local byte verification only. Git index flags/filters are not integrity evidence.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export function assertPinnedOperatorCheckout(root,expectedSha){
 const refuse=()=>{throw Error('PINNED_CHECKOUT_UNQUALIFIED');};
 if(!/^[a-f0-9]{40}$/.test(expectedSha)||fs.realpathSync(root)!==root)refuse();
 // Do not let caller Git environment redirect verification to another repository,
 // index, object database or replacement object. Linked worktrees remain supported.
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_')));
 env.GIT_NO_REPLACE_OBJECTS='1';
 const git=args=>execFileSync('git',['--no-replace-objects','-C',root,...args],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
 if(git(['rev-parse','--show-toplevel']).trim()!==root||git(['rev-parse','--verify','HEAD']).trim()!==expectedSha)refuse();
 git(['diff','--cached','--quiet','--no-ext-diff','--no-textconv',expectedSha,'--']);
 const entries=git(['ls-tree','-r','-z','--full-tree',expectedSha]).split('\0').filter(Boolean);
 if(!entries.length)refuse();
 for(const entry of entries){
  const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s.exec(entry);
  if(!match)refuse();
  const [,mode,blob,relative]=match;
  if(path.isAbsolute(relative)||relative.split('/').some(p=>!p||p==='.'||p==='..')||relative.includes('\\'))refuse();
  const file=path.join(root,relative);
  if(fs.realpathSync(file)!==file)refuse();
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try{
   const before=fs.fstatSync(fd);
   if(!before.isFile()||before.nlink!==1||Boolean(before.mode&0o111)!==(mode==='100755'))refuse();
   const hash=createHash('sha1').update(Buffer.from('blob '+before.size+'\0'));
   const buffer=Buffer.alloc(65536);let total=0,n;
   while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0){hash.update(buffer.subarray(0,n));total+=n;}
   const after=fs.fstatSync(fd),current=fs.lstatSync(file);
   if(total!==before.size||hash.digest('hex')!==blob||['dev','ino','size','mode','nlink','mtimeMs','ctimeMs'].some(k=>before[k]!==after[k]||after[k]!==current[k]))refuse();
  }finally{fs.closeSync(fd);}
 }
 // Include ignored source: .gitignore, .git/info/exclude and global excludes must
 // not hide an added module. Only the generated launcher is allowed in this scope.
 if(git(['ls-files','--others','-z','--','src','scripts','schema']).split('\0').some(p=>p&&p!=='scripts/.brick-operator-launcher.mjs'))refuse();
 return {sourceSha:expectedSha,trackedFilesVerified:entries.length};
}
