import assert from "node:assert/strict";
import {readFileSync,readdirSync,statSync} from "node:fs";
import {pathToFileURL} from "node:url";
const {parentV8Html}=await import(pathToFileURL(process.argv[2]).href);
const {parentV7LiveHtml}=await import(pathToFileURL(process.argv[3]).href);
const leakPatterns=[
 ["private-key-block",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
 ["server-secret-value",/(?:CLOUDFLARE_API_TOKEN|ONEMAP_PASSWORD|DEV_PARENT_LOGIN_HASH|CF_ACCESS_CLIENT_SECRET)\s*[:=]\s*["'`]?[^\s"'`]{12,}/i],
 ["cloudflare-token-header",/X-Auth-Key\s*[:=]\s*["'`]?[a-f0-9]{37,}/i],
 ["private-env-data",/CLOUDFLARE_API_TOKEN\s*[:=]\s*[A-Za-z0-9_+./=-]{30,}/i]
];
function detect(text){return leakPatterns.filter(([,rx])=>rx.test(text)).map(([type])=>type);}
assert(detect("CLOUDFLARE_API_TOKEN=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789").includes("server-secret-value"),"secret detection disabled");
assert(detect("-----BEGIN PRIVATE KEY-----\nnot-real-data\n-----END PRIVATE KEY-----").includes("private-key-block"));
assert.deepEqual(detect("CF_ACCESS_AUD=__CF_ACCESS_AUD__"),[],"placeholders should not be treated as secrets");
let checked=0;
function verify(name,content){const matches=detect(content);assert.equal(matches.length,0,"potential private credential in parent/browser artifact "+name+": "+matches.join(","));checked++;}
verify("production-rendered-parent",parentV8Html());
verify("development-rendered-parent",parentV7LiveHtml());
function walk(dir){
 for(const item of readdirSync(dir,{withFileTypes:true})){
  if(item.name.startsWith("."))continue;
  const path=dir+"/"+item.name;
  if(item.isDirectory()){walk(path);continue;}
  if(!item.isFile()||!/\.(?:html?|m?js|css|json|map|txt)$/i.test(item.name))continue;
  if(statSync(path).size>15*1024*1024)throw Error("public artifact too large for bounded credential scan: "+path);
  verify(path,readFileSync(path,"utf8"));
 }
}
walk("public");
console.log("PASS 8D.15: "+checked+" rendered parent/public assets scanned for high-confidence private credentials; synthetic positive controls detected; historic commits/live CDN/Cloudflare logs still UNKNOWN");
