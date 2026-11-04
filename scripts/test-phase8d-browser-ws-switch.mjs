#!/usr/bin/env node
// 8D.10: exercise the exact GENERATED production and development browser connect()
// functions in isolated Node vm with synthetic WebSockets/timers. No real browser or Cloudflare.
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import {pathToFileURL} from "node:url";
const [prodFile,devFile]=process.argv.slice(2);
assert(prodFile&&devFile,"pass compiled parent-v8 and parent-v7-live modules");
const {parentV8Html}=await import(pathToFileURL(prodFile).href);
const {parentV7LiveHtml}=await import(pathToFileURL(devFile).href);
function browserFunctionSource(html,name){
 const script=html.match(/<script\s+type=["']module["'](?:\s+nonce=["'][^"']+["'])?>([\s\S]*?)<\/script>/);
 assert(script,"cannot locate actual browser module");
 const parsed=ts.createSourceFile("brick-parent.js",script[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const found=[];
 const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found.push(n);ts.forEachChild(n,visit);};
 visit(parsed);
 assert.equal(found.length,1,"parent must define one "+name+"() function");
 return found[0].getText(parsed);
}
async function run(kind,html){
 const received=[],sockets=[],timeouts=[],intervals=new Set();
 class FakeSocket {
  constructor(url){this.url=url;this.readyState=0;this.onmessage=null;this.onclose=null;sockets.push(this);}
  close(){this.readyState=3;}
 }
 let timerId=0;
 const context={WebSocket:FakeSocket,location:{protocol:"https:",host:"brick.invalid"},navigator:{onLine:true},currentDevice:"",ws:null,phase5StateTimer:null,
  phase5WsRetry:0,phase5WsRenewTimer:null,portalReconnectAttempt:0,portalLastMessageAt:0,
  clearInterval(id){intervals.delete(id)},
  setInterval(fn,delay){const id=++timerId;intervals.add(id);return id;},
  setTimeout(fn,delay){const id=++timerId;timeouts.push({id,fn,delay});return id;},
  clearTimeout(id){const i=timeouts.findIndex(x=>x.id===id);if(i>=0)timeouts.splice(i,1);},
  wsMessage(m){received.push(m)},
  async refreshPhase5State(){},async loadLocationControl(){},
  setPortalLive(){},portalLog(){},
  JSON,Date,Promise,Math,console
 };
 vm.createContext(context);
 vm.runInContext(browserFunctionSource(html,"connect"),context);
 assert.equal(typeof context.connect,"function");
 context.connect("child-a");
 assert.equal(sockets.length,1,kind+" initial socket");
 const first=sockets[0];
 assert(first.url.endsWith("/child-a/ws"));
 context.connect("child-b");
 assert.equal(sockets.length,2,kind+" second child socket");
 const second=sockets[1];
 assert(second.url.endsWith("/child-b/ws"));
 assert.equal(intervals.size,1,kind+" must run exactly one fallback refresh interval");
 // An already queued message or close event from previous device must never affect B.
 first.onmessage?.({data:JSON.stringify({type:"location",state:{lat:1.4}})});
 assert.equal(received.length,0,kind+" stale A message contaminated B dashboard");
 first.onclose?.({code:1000,reason:"normal"});
 assert.equal(intervals.size,1,kind+" stale A close cleared B fallback refresh");
 assert.equal(timeouts.length,0,kind+" stale A close scheduled reconnect");
 // A terminal 4003 revocation or logout is NOT an expired 4001 lease.
 second.onclose?.({code:4003,reason:"Subscription revoked"});
 assert.equal(timeouts.length,0,kind+" terminal revoked/logout socket started reconnect flood");
 // A normal 30s lease expiry should create exactly one bounded retry.
 context.connect("child-c");
 const third=sockets[2];
 third.onclose?.({code:4001,reason:"Subscription expired"});
 assert.equal(timeouts.length,1,kind+" normal expiry did not schedule reconnect");
 assert(timeouts[0].delay>=500&&timeouts[0].delay<=15000,kind+" retry outside bounded backoff");
 context.connect("child-d");
 const fourth=sockets[3];
 fourth.onopen?.({});
 const renew=timeouts.filter(t=>t.delay>=20000&&t.delay<=26000);
 assert.equal(renew.length,1,kind+" must proactively renew before the 30-second server lease expires");
 renew[0].fn();
 assert.equal(sockets.length,5,kind+" proactive renewal did not open a new authenticated connection");
 assert.equal(fourth.readyState,3,kind+" proactive renewal did not retire previous socket");
 
 const oldResponses=[];
 let completeOldResponse;
 const asyncContext={currentDevice:"child-a",api(){return new Promise(resolve=>{completeOldResponse=resolve})},renderSnapshot(response){oldResponses.push(response)}};
 vm.createContext(asyncContext);
 vm.runInContext(browserFunctionSource(html,"refreshPhase5State"),asyncContext);
 const oldPromise=vm.runInContext("refreshPhase5State('child-a')",asyncContext);
 asyncContext.currentDevice="child-b";
 completeOldResponse({childId:"child-a",state:{lat:1.43}});
 await oldPromise;
 assert.equal(oldResponses.length,0,kind+" stale child A async HTTP state repainted child B");
 console.log("PASS "+kind+" browser generated WS: obsolete events ignored, fallback refresh isolated, terminal revocation stops retry, 30s lease reconnect bounded");
}
await run("production",parentV8Html());
await run("development",parentV7LiveHtml());
