#!/usr/bin/env node
// Phase 8D.15: detect accidental PRIVATE credentials in the generated public parent assets.
// Scan values only in memory; never print offending token contents.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root="public";
assert(fs.existsSync(root),"public assets must be built before secret surface verification");
const files=[];
function visit(directory){
 for(const item of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,item.name);
  if(item.isDirectory())visit(file);
  else if(item.isFile()&&/\.(html|js|mjs|css|json|map|txt)$/i.test(item.name))files.push(file);
 }
}
visit(root);
assert(files.length>=2,"must inspect nonempty built public asset set; found "+files.length);
const forbidden=[
 ["PEM private key",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ["Cloudflare API token environment variable",/\bCLOUDFLARE_API_TOKEN\b/],
 ["Development parent login private hash",/\bDEV_PARENT_LOGIN_HASH\b/],
 ["Development parent login private token",/\bBRICK_DEV_PARENT_ACCESS_TOKEN\b/],
 ["Android signing keystore",/\bBRICK_ANDROID_KEYSTORE_B64\b/],
 ["Android signing password",/\bBRICK_ANDROID_KEY_PASSWORD\b/],
 ["Unrotated six-digit beta credential hash",/931967fb6beab2e36f903438e73707c7e34bfec84c2492bb5cabc197e7bbc77d/i],
 ["Cloudflare Access JWT internal header",/\bCf-Access-Jwt-Assertion\b/],
 ["Server-only development internal auth marker",/\bX-Brick-Dev-Parent-Verified\b/]
];
let textFiles=0;const failures=[];
for(const file of files){
 const content=fs.readFileSync(file);
 if(content.length>10*1024*1024)throw Error("unbounded browser asset encountered: "+file);
 const text=content.toString("utf8");
 textFiles++;
 for(const [name,pattern] of forbidden){
  if(pattern.test(text))failures.push(file+" contains "+name);
 }
}
if(failures.length)throw Error("PRIVATE CREDENTIAL EXPOSURE CATEGORIES:\n"+failures.join("\n"));
console.log("PASS 8D.15: scanned "+textFiles+" actual built public browser assets; no high-risk server credential markers or PEM private keys found. This is NOT a Git history or deployed CDN scan.");
