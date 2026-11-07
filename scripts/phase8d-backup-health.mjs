// Explicit read-only archive check. Never registers cron/scheduler or accesses a provider.
import {readPrivateBackupFile} from './cardfree-private-file.mjs';
import {checkProtectedBackupHealth,validateBackupHealthPolicy} from './cardfree-backup-health.mjs';
try{
 const [archive,policyFile,...extra]=process.argv.slice(2);if(!archive||!policyFile||extra.length)throw Error('usage');
 const policy=validateBackupHealthPolicy(JSON.parse(readPrivateBackupFile(policyFile,4096).toString('utf8')));
 const result=await checkProtectedBackupHealth({policy,key:process.env.BRICK_BACKUP_ENCRYPTION_KEY,readArchive:({maxBytes})=>readPrivateBackupFile(archive,maxBytes)});
 console.log(JSON.stringify(result));process.exitCode=result.status==='FRESH'?0:result.status==='STALE'?2:1;
}catch{console.error('Backup health check refused; verify private policy, archive, trusted context and key.');process.exitCode=1;}
