// Conservative static source inventory, never proof that every runtime writer is fenced.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const basis=process.argv[2];if(!/^[a-f0-9]{40}$/.test(basis??''))throw Error('Exact source basis SHA required');
const entry='src/worker-beta-cardfree.ts',queue=[entry],seen=new Set(),files=[],actors=[],unresolved=[],external=new Set();
const mutationMethods=new Set(['put','delete','deleteAll','transaction','transactionSync','exec','batch','setAlarm','deleteAlarm']);
const hash=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
while(queue.length){
 const file=queue.shift();if(seen.has(file))continue;seen.add(file);
 const bytes=fs.readFileSync(file),code=bytes.toString('utf8'),ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true),imports=[],sites=[];
 const position=node=>{const p=ast.getLineAndCharacterOfPosition(node.getStart(ast));return{line:p.line+1,column:p.character+1};};
 for(const node of ast.statements){
  if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue;
  const spec=node.moduleSpecifier;if(!spec||!ts.isStringLiteral(spec))continue;
  const name=spec.text;if(!name.startsWith('.')){external.add(name);continue;}
  const base=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
  const resolved=[base,base+'.ts',base+'.tsx',base+'.js',base+'.mjs',base+'.json',base+'/index.ts'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
  if(!resolved){unresolved.push({file,specifier:name,...position(node)});continue;}
  imports.push(resolved);if(/\.(?:[cm]?js|tsx?)$/.test(resolved))queue.push(resolved);
 }
 function visit(node){
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
   const method=node.expression.name.text,receiver=node.expression.expression.getText(ast);let kind,sqlKind;
   if(method==='prepare'){
    kind='SQL_PREPARE_CANDIDATE';const arg=node.arguments[0],literal=arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))?arg.text:null;
    sqlKind=literal&&/^\s*(SELECT|EXPLAIN)\b/i.test(literal)?'READ_CANDIDATE':'WRITE_OR_UNKNOWN';
   }else if(mutationMethods.has(method))kind='MUTATION_OR_WRAPPER_CANDIDATE';
   else if(method==='waitUntil')kind='DEFERRED_WORK_CANDIDATE';
   if(kind)sites.push({...position(node),kind,method,receiver:receiver.slice(0,180),...(sqlKind?{sqlKind}:{}),dynamicReceiver:receiver.length>180});
  }
  if(ts.isClassDeclaration(node)&&node.name&&node.heritageClauses?.some(h=>h.types.some(t=>/DurableObject|BrickDevice/.test(t.expression.getText(ast))))){
   const methods=node.members.filter(m=>ts.isMethodDeclaration(m)&&m.name&&!m.modifiers?.some(x=>x.kind===ts.SyntaxKind.PrivateKeyword)).map(m=>({name:m.name.getText(ast),...position(m)}));
   actors.push({file,className:node.name.text,methods});
  }
  ts.forEachChild(node,visit);
 }
 visit(ast);files.push({path:file,sha256:hash('sha256',bytes),gitBlobSha:hash('sha1',Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])),imports:imports.sort(),sites});
}
files.sort((a,b)=>a.path.localeCompare(b.path));actors.sort((a,b)=>a.file.localeCompare(b.file));
const all=files.flatMap(f=>f.sites),productionPaths=files.map(f=>f.path);
const report={format:'brick-group1-write-inventory-v1',basisCommitSha:basis,entry,activation:'NOT_READY',
 notice:'Static candidates from relative import/export reachability only. Read-only prepares, cache/ephemeral writes and wrapper methods are retained for review. This is neither a complete runtime call graph nor enforced writer coverage. External scripts/operators, dynamic dispatch, deferred descendants and imported package behavior require separate accounting.',
 summary:{sourceFiles:files.length,sqlPrepareCandidates:all.filter(s=>s.kind==='SQL_PREPARE_CANDIDATE').length,sqlWriteOrUnknown:all.filter(s=>s.sqlKind==='WRITE_OR_UNKNOWN').length,mutationOrWrapperCandidates:all.filter(s=>s.kind==='MUTATION_OR_WRAPPER_CANDIDATE').length,deferredWorkCandidates:all.filter(s=>s.kind==='DEFERRED_WORK_CANDIDATE').length,actorClasses:actors.length,unresolvedLocalImports:unresolved.length},
 runtimeSourceSetSha256:hash('sha256',Buffer.from(JSON.stringify(files.map(f=>({path:f.path,sha256:f.sha256}))))),
 stagedAuthorityImportedByProduction:productionPaths.includes('src/cardfree-capture-admission.ts'),
 activationGaps:['Every real ingress/RPC/alarm/deferred descendant must retain writer ownership through its final side effect.','Urgent admission must invalidate capture; authority/storage/transport outages require a separately proven safety-preserving fallback.','External SQL, migrations, publication scripts and direct bindings can bypass a Worker-only gate.','Source/resource/authority identity and authenticated transport must be pinned.','Independent private destination, separate key/trusted context, schedule, PITR and isolated cloud recovery remain unverified.'],
 unresolvedLocalImports:unresolved,externalImports:[...external].sort(),actorEntrypoints:actors,files};
console.log(JSON.stringify(report,null,2));
