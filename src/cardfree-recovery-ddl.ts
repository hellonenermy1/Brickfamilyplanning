// Reviewed effective migration SQL identity. This deliberately accepts only the
// pinned token definitions, not arbitrary semantically equivalent SQLite DDL.
// Whitespace/comments outside quotes are insignificant; quoted bytes are not.
export function canonicalRecoverySql(sql:unknown):string[]{
 if(typeof sql!=='string'||!sql.length||sql.length>65536)throw Error('recovery schema changed');
 const tokens:string[]=[];let i=0;
 while(i<sql.length){
  if(/[ \t\n\v\f\r]/.test(sql[i])){i++;continue;}
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i+2);i=end===-1?sql.length:end+1;continue;}
  if(sql.startsWith('/*',i)){const end=sql.indexOf('*/',i+2);if(end===-1)throw Error('recovery schema changed');i=end+2;continue;}
  const start=i,quote=sql[i];
  if(["'",'"','`','['].includes(quote)){
   const close=quote==='['?']':quote;let closed=false;i++;
   while(i<sql.length){if(sql[i]===close){i++;if(quote!=='['&&sql[i]===close){i++;continue;}closed=true;break;}i++;}
   if(!closed)throw Error('recovery schema changed');tokens.push(sql.slice(start,i));continue;
  }
  if(/[A-Za-z_]/.test(sql[i])){i++;while(i<sql.length&&/[A-Za-z0-9_$]/.test(sql[i]))i++;tokens.push(sql.slice(start,i).toLowerCase());continue;}
  // Retain each numeric/punctuation byte. This avoids rewriting expressions,
  // numeric formats, operator order or literal payloads as "equivalent" SQL.
  tokens.push(sql[i++]);
 }
 if(!tokens.length)throw Error('recovery schema changed');return tokens;
}
type Definition={type:string;name:string;tbl_name:string;sql:string};
export async function recoverySchemaDigest(objects:Definition[]){
 if(!Array.isArray(objects)||!objects.length||objects.length>256)throw Error('recovery schema changed');
 const definitions=objects.map(o=>{
  if(!o||!['table','index'].includes(o.type)||typeof o.name!=='string'||typeof o.tbl_name!=='string')throw Error('recovery schema changed');
  return JSON.stringify([o.type,o.name,o.tbl_name,canonicalRecoverySql(o.sql)]);
 }).sort();
 const bytes=new TextEncoder().encode(JSON.stringify(definitions));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
// Updated only after explicit review against effective primary/beta migrations.
const PRIMARY='3bd9901c9432c41fe9483b2d9dca31f0f9b41bf2ffd5c2dd856a807ea3bba7be';
const DIAGNOSTICS='a2f985b2ab01091eac21a2ae3397e35ce8d3071bbe64d2b043662e4b6986b943';
export async function assertRecoveryDDL(objects:Definition[],primary:boolean){
 if(await recoverySchemaDigest(objects.filter(o=>o.type==='table'||o.type==='index'))!==(primary?PRIMARY:DIAGNOSTICS))throw Error('recovery schema changed');
}
