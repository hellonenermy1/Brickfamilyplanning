// Read-only bounded private-file primitive. Final-component nofollow/nonblocking;
// trusted parent path and same-user process isolation remain operator duties.
import fs from 'node:fs';

export function readPrivateBackupFile(file,limit) {
  if(!Number.isSafeInteger(limit)||limit<1||limit>32*1024*1024)throw Error('private read limit');
  if(typeof fs.constants.O_NOFOLLOW!=='number'||typeof fs.constants.O_NONBLOCK!=='number')throw Error('private read unsupported');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  try {
    const stat=fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit || (stat.mode&0o077)!==0) throw Error('private input file required');
    const buffer=Buffer.alloc(stat.size);let offset=0;
    while (offset < buffer.length) { const n=fs.readSync(fd,buffer,offset,buffer.length-offset,null);if (!n) throw Error('incomplete input file');offset+=n; }
    if (fs.readSync(fd,Buffer.alloc(1),0,1,null)) throw Error('input file changed during read');
    const after=fs.fstatSync(fd);
    if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)throw Error('input file changed during read');
    return buffer;
  } finally { fs.closeSync(fd); }
}
