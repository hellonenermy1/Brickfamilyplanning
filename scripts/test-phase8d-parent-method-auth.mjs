import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const worker=(await import(pathToFileURL(process.argv[2]).href)).default;
const lines=readFileSync("audit/phase8d/PHASE8D_ENDPOINT_MATRIX_V2.csv","utf8").trim().split(/\r?\n/);
const columns=line=>{const x=[];let v="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){v+='"';i++;}else q=!q;}else if(c===","&&!q){x.push(v);v="";}else v+=c;}x.push(v);return x;};
const parent=lines.slice(1).map(columns).filter(x=>x[1].startsWith("/parent/")||x[1]==="/parent");
const env={APP_ENV:"production",CF_ACCESS_TEAM_DOMAIN:undefined,CF_ACCESS_AUD:undefined,
 DB:{prepare(){throw Error("anonymous request reached D1")},batch(){throw Error("anonymous reached D1 batch")}},
 BRICK_DEVICE:{idFromName(){throw Error("anonymous reached DO")},get(){throw Error("anonymous reached DO")}},
 HISTORY:{get(){throw Error("anonymous reached R2")}},MAPS:{},EVENTS:{send(){throw Error("anonymous reached Queue")}},
 PAIR_RATE:{async limit(){throw Error("anonymous consumed pairing quota")}},DEVICE_RATE:{async limit(){throw Error("anonymous consumed device quota")}},
 PARENT_HISTORY_RATE:{async limit(){throw Error("anonymous consumed history quota")}},
 PARENT_WS_RATE:{async limit(){throw Error("anonymous consumed socket quota")}},
 PARENT_GEOCODE_RATE:{async limit(){throw Error("anonymous consumed reverse quota")}},
 PARENT_COMMUTE_RATE:{async limit(){throw Error("anonymous consumed commute quota")}}};
const ctx={waitUntil(){throw Error("anonymous started background work")}};
let tested=0;
for(const [rawMethod,rawPath] of parent){
 const path=rawPath.replace(/\{[^}]+\}/g,"00000000-0000-4000-8000-000000000001");
 const methods=rawMethod.split("/").filter(m=>["GET","POST","PATCH","DELETE"].includes(m));
 if(rawMethod==="GET/UPGRADE")methods.push("GET");
 for(const method of [...new Set(methods)]){
  const url="https://brick.invalid"+path;
  const headers={Origin:"https://brick.invalid","Content-Type":"application/json"};
  if(rawMethod==="GET/UPGRADE")headers.Upgrade="websocket";
  let response;
  try{response=await worker.fetch(new Request(url,{method,headers,...(["POST","PATCH"].includes(method)?{body:"{}"}:{})}),env,ctx);}
  catch(e){throw Error("anonymous "+method+" "+rawPath+" reached trust boundary: "+String(e).slice(0,180));}
  assert([401,403,404,405].includes(response.status),"unauthed "+method+" "+rawPath+" returned "+response.status);
  assert.equal(response.headers.get("Cache-Control")?.toLowerCase().includes("public"),false,"private response cacheable");
  tested++;
 }
}
assert(tested>=28,"unexpected drop in authenticated parent endpoint coverage: "+tested);
console.log("PASS 8D.2/.3/.11: "+tested+" actual full Worker parent method probes denied without production Access; no D1/DO/R2/Queue or expensive-rate side effects (source simulation)");
