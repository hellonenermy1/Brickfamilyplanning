#!/usr/bin/env node
// 8D.2: static AST route discovery across the complete layered production Worker.
// This proves source inventory coverage only, NOT deployed route/method/auth correctness.
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const layers=["src/index.ts","src/worker-v5b.ts","src/worker-v6.ts","src/worker-v7.ts","src/worker-v8.ts","src/worker-v9.ts","src/worker-p8b.ts"];
const lines=fs.readFileSync("audit/phase8d/PHASE8D_ENDPOINT_MATRIX_V2.csv","utf8").split(/\r?\n/).filter(x=>x.startsWith('"'));
const registry=lines.slice(1).map(line=>{
 const parts=[];let cur="",quote=false;
 for(let i=0;i<line.length;i++){let c=line[i];if(c==='"'){if(quote&&line[i+1]==='"'){cur+='"';i++;}else quote=!quote;}else if(c===","&&!quote){parts.push(cur);cur="";}else cur+=c;}
 parts.push(cur);return {method:parts[0],path:parts[1]};
});
assert.equal(registry.length,49);
const sample=path=>path.replace(/\{[^}]+\}/g,"12345678-1234-4234-8234-123456789abc");
const exact=[],patterns=[];
for(const filename of layers){
 const raw=fs.readFileSync(filename,"utf8"),sf=ts.createSourceFile(filename,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 function visit(node){
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken){
   const a=node.left,b=node.right,ai=a.getText(sf),bi=b.getText(sf);
   if(ai.endsWith(".pathname")&&ts.isStringLiteral(b)&&b.text.startsWith("/"))exact.push({filename,path:b.text});
   if(bi.endsWith(".pathname")&&ts.isStringLiteral(a)&&a.text.startsWith("/"))exact.push({filename,path:a.text});
  }
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==="match"&&node.expression.expression.getText(sf).endsWith(".pathname")){
   const token=node.arguments[0];
   if(token&&ts.isRegularExpressionLiteral(token)){
    const literal=token.getText(sf),end=literal.lastIndexOf("/");
    try{patterns.push({filename,literal,regex:new RegExp(literal.slice(1,end),literal.slice(end+1))});}
    catch(e){throw Error("unparseable production route regex "+filename+" "+literal);}
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(sf);
}
function found(path){return exact.some(x=>x.path===path||(x.path==="/parent/"&&path==="/parent"))||patterns.some(x=>x.regex.test(path));}
const missing=registry.filter(x=>!found(sample(x.path)));
assert.equal(missing.length,0,"Matrix paths lacking source match: "+JSON.stringify(missing));
const unmapped=[
 ...exact.filter(x=>x.path.startsWith("/api/")||x.path.startsWith("/parent/")).filter(x=>!registry.some(r=>sample(r.path)===x.path||(x.path==="/parent/"&&r.path==="/parent"))),
 ...patterns.filter(x=>!registry.some(r=>x.regex.test(sample(r.path))))
];
assert.equal(unmapped.length,0,"SOURCE ROUTES NOT IN 49-ROW MATRIX: "+JSON.stringify(unmapped.map(x=>({file:x.filename,path:x.path??x.literal}))));
const dev=fs.readFileSync("audit/phase8d/PHASE8D_DEVELOPMENT_ENDPOINTS.csv","utf8").trim().split(/\r?\n/).slice(1);
assert.equal(dev.length,3,"Development 3-login/logout routes must remain inventoried");
const devSource=fs.readFileSync("src/dev-parent-auth.ts","utf8");
for(const route of ["/parent/login","/parent/logout"])assert(devSource.includes('url.pathname === "'+route+'"'),"Missing dev session route "+route);
console.log("PASS 8D.2: "+registry.length+" production candidate paths matched AST layered routes; "+dev.length+" separate dev login/logout method records; untested deployed methods/auth remain explicitly OPEN");
