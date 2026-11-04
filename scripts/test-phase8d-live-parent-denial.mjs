import assert from "node:assert/strict";
import {probeParentSurface} from "./phase8d-live-parent-denial.mjs";
const id="a".repeat(32),base="/client/v4/accounts/"+id;
function fixture({subdomain="synthetic",prodEnabled=true,devEnabled=true,policy="denied",metadata403=false}={}){
 const cfCalls=[],webCalls=[];
 const metadataFetch=async(url,init)=>{
   assert.equal(init.method,"GET");
   assert.equal(init.redirect,"error");
   assert(init.headers.Authorization.startsWith("Bearer "));
   const path=new URL(url).pathname;cfCalls.push(path);
   const ok={
    [base+"/workers/subdomain"]:{subdomain},
    [base+"/workers/scripts/brick-family-v1/subdomain"]:{enabled:prodEnabled,previews_enabled:false},
    [base+"/workers/scripts/brick-family-v1-dev/subdomain"]:{enabled:devEnabled,previews_enabled:false}
   };
   return {ok:!metadata403,status:metadata403?403:200,async json(){return{success:true,result:ok[path]}}};
 };
 const httpFetch=async(url,init)=>{
   webCalls.push({url,init});
   assert.equal(init.method,"GET");assert.equal(init.redirect,"manual");
   assert(!("Authorization" in init.headers));
   assert(!("Cookie" in init.headers));
   assert(/^https:\/\/brick-family-v1(?:-dev)?\.synthetic\.workers\.dev\/parent(?:\/api\/devices|\/map\/status|\/login)?$/.test(url),"untrusted hostname/path "+url);
   const code=policy==="public"?200:
     url.endsWith("/parent/login")?(url.includes("brick-family-v1-dev.")?200:404):
     policy==="redirect-wrong"?302:policy==="denied"?403:302;
   const location=policy==="redirect-wrong"?"https://untrusted.invalid/signin":"/cdn-cgi/access/login";
   return {status:code,headers:new Headers({location})};
 };
 return {cfCalls,webCalls,metadataFetch,httpFetch};
}
const creds={token:"synthetic-token",accountId:id};
const safe=fixture(),r=await probeParentSurface({...creds,...safe});
assert.equal(r.allPass,true);assert.equal(r.checks.length,12);assert.equal(r.requestsSent,12);
assert.equal(safe.cfCalls.length,3);assert.equal(safe.webCalls.length,12);
assert.equal(safe.webCalls.filter(x=>Object.hasOwn(x.init.headers,"X-Brick-Dev-Parent-Verified")).length,4);
assert(!JSON.stringify(r).includes("synthetic-token"));
for(const conf of [{policy:"public"},{policy:"redirect-wrong"},{prodEnabled:false},{devEnabled:false},{metadata403:true},{subdomain:"evil.com/attack"}]){
 const env=fixture(conf),out=await probeParentSurface({...creds,...env});
 assert.equal(out.allPass,false,"false acceptance "+JSON.stringify(conf));
 if(conf.subdomain)assert.equal(env.webCalls.length,0,"invalid host should never trigger HTTP");
 if(conf.metadata403)assert.equal(env.webCalls.length,0);
}
const missing=await probeParentSurface({token:null,accountId:id,...fixture()});
assert.equal(missing.requestsSent,0);assert.equal(missing.allPass,false);
console.log("PASS 8D.2/.10/.11: 12 exact parent GET/forged/login/map probes, only API-grounded hostname, no secret/response body, negative cases fail closed");
