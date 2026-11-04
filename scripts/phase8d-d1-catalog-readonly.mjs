#!/usr/bin/env node
// Read-only D1 database catalog verification: no SQL queries, no user records.
import fs from "node:fs";
import {pathToFileURL} from "node:url";
const API="https://api.cloudflare.com/client/v4";
const accountRe=/^[a-f0-9]{32}$/i;
const expected=["brick-family-v1","brick-family-v1-dev"];
const uuidRe=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function inspectD1Catalog({token,accountId,request=fetch}={}){
 const report={format:"brick-phase8d-d1-catalog-v1",status:"BLOCKED",proof:[],readOnly:true,queries:0};
 if(!token||!accountRe.test(accountId??"")){report.reason="Dedicated audit token or account ID not configured";return report;}
 const found={};
 for(const name of expected){
  let rows=[],complete=false;
  for(let page=1;page<=10;page++){
   const path="/accounts/"+accountId+"/d1/database?name="+name+"&per_page=100&page="+page;
   // All endpoints are fixed, finite read-only GET requests.
   try{
    const response=await request(API+path,{method:"GET",redirect:"error",headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
    report.queries++;
    if(!response.ok){report.reason="D1 database catalog GET HTTP "+response.status+"; D1 Read permission/resource access needed";return report;}
    const data=await response.json();
    if(data?.success!==true||!Array.isArray(data.result)){report.reason="Unexpected D1 catalog response; cannot trust resource identity";return report;}
    rows.push(...data.result.filter(x=>x?.name===name));
    const info=data.result_info;
    if((Number.isInteger(info?.total_pages)&&info.total_pages>0&&page>=info.total_pages)||data.result.length<100){complete=true;break;}
   }catch{report.reason="D1 catalog request blocked or timed out";return report;}
  }
  if(!complete){report.reason="D1 catalog search exceeded 10-page upper bound";return report;}
  const unique=rows.filter(x=>typeof x.uuid==="string"&&uuidRe.test(x.uuid));
  if(unique.length!==1){report.status="DRIFT";report.reason="Database "+name+" missing or ambiguous";report.proof.push({name,present:false});return report;}
  found[name]=unique[0].uuid;
  report.proof.push({name,present:true,uuidVerified:true});
 }
 if(found[expected[0]]===found[expected[1]]){report.status="FAIL";report.reason="Production and development D1 UUIDs overlap";return report;}
 report.status="ATTESTED";report.reason="Two uniquely named account D1 databases exist with different UUIDs; table contents and active Worker binding parity NOT tested";
 report.databasesDistinct=true;
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await inspectD1Catalog({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID});
 console.log("D1 metadata catalog: "+report.status+" — "+report.reason);
 fs.writeFileSync("phase8d-d1-catalog-result.json",JSON.stringify(report,null,2)+"\n",{mode:0o600});
 if(report.status!=="ATTESTED")process.exitCode=2;
}
