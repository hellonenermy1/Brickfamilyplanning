#!/usr/bin/env node
// Phase 8D live minimal-scope security smoke. No cookie, user data, Worker body,
// R2 object, D1 query, authorization header on public GET, or content logged.
import fs from "node:fs";
import {pathToFileURL} from "node:url";
const API="https://api.cloudflare.com/client/v4";
const WORKERS=["brick-family-v1","brick-family-v1-dev"];
const PROBES=[
 {path:"/parent",expect:"denied"},
 {path:"/parent/api/devices",expect:"denied"},
 {path:"/parent",expect:"denied",forged:true}
];
const accountRe=/^[0-9a-f]{32}$/i,subdomainRe=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
export async function probeParentSurface({token,accountId,metadataFetch=fetch,httpFetch=fetch}={}){
 const result={format:"brick-phase8d-unauthenticated-parent-live-v1",checks:[],allPass:false,requestsSent:0};
 const record=(name,status,detail)=>result.checks.push({name,status,detail});
 if(!token||!accountRe.test(accountId??"")){record("parent_surface","BLOCKED","Read-only Cloudflare token or account ID not configured");return result;}
 async function cf(path){
  if(!(/^\/accounts\/[0-9a-f]{32}\/workers\/(?:subdomain|scripts\/(?:brick-family-v1|brick-family-v1-dev)\/subdomain)$/i.test(path))||
    !path.startsWith("/accounts/"+accountId+"/"))throw Error("Disallowed Cloudflare metadata path");
  const response=await metadataFetch(API+path,{method:"GET",redirect:"error",headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("Cloudflare metadata HTTP "+response.status);
  const envelope=await response.json();
  if(envelope?.success!==true||!envelope.result)throw Error("Cloudflare metadata missing");
  return envelope.result;
 }
 let subdomain;
 try{const account=await cf("/accounts/"+accountId+"/workers/subdomain");subdomain=account?.subdomain;
  if(!subdomainRe.test(subdomain??""))throw Error("Invalid account Workers subdomain");
 }catch{record("workers_dev_domain","BLOCKED","Account Workers.dev hostname unreadable or invalid");return result;}
 for(const name of WORKERS){
  let state;
  try{state=await cf("/accounts/"+accountId+"/workers/scripts/"+name+"/subdomain");}
  catch{record(name,"BLOCKED","Worker subdomain status unreadable");continue;}
  if(state?.enabled!==true){record(name,"BLOCKED","Worker.dev is not enabled; actual route/custom domain unresolved");continue;}
  const host=name+"."+subdomain+".workers.dev";
  for(const item of PROBES){
    const label=name+item.path+(item.forged?":forged-header":"");
    const headers=item.forged?{"X-Brick-Dev-Parent-Verified":"session-v1"}:{};
    try{
      // No implicit redirect following; a public 200 is a security failure.
      const response=await httpFetch("https://"+host+item.path,{method:"GET",headers,redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(15000)});
      result.requestsSent++;
      const status=response.status;
      const redirect=response.headers?.get?.("location")??null;
      const knownRedirect=typeof redirect==="string"&&(
        /^\/cdn-cgi\/access\//.test(redirect)||
        /^https:\/\/[a-z0-9.-]+\.cloudflareaccess\.com\//i.test(redirect)||
        (name.endsWith("-dev")&&(/^\/parent\/login(?:\?|$)/.test(redirect)||redirect==="https://"+host+"/parent/login"))
      );
      if(status===401||status===403||([302,303,307].includes(status)&&knownRedirect)){
        record(label,"ATTESTED","Unauthenticated GET denied (HTTP "+status+")");continue;
      }
      if(status===200){record(label,"FAIL","Protected parent URL publicly returned HTTP 200");continue;}
      record(label,"BLOCKED","HTTP "+status+" inconclusive: cannot certify parent denial");
    }catch{record(label,"BLOCKED","Public host request failed/timed out; availability and auth unknown");}
  }
 }
 result.allPass=result.checks.length===PROBES.length*WORKERS.length&&result.checks.every(x=>x.status==="ATTESTED");
 return result;
}
export function parentSummary(result){
 return result.checks.map(x=>x.name+": "+x.status+" — "+x.detail).join("\n")+"\nProtected unauthenticated surface: "+(result.allPass?"ATTESTED":"NOT VERIFIED / FAILURE");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await probeParentSurface({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID});
 console.log(parentSummary(result));
 fs.writeFileSync("phase8d-parent-denial-result.json",JSON.stringify(result,null,2)+"\n",{mode:0o600});
 if(!result.allPass)process.exitCode=2;
}
