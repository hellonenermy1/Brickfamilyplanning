#!/usr/bin/env node
// 8D.9: exercise actual DLQ replay logic under synthetic poison/unknown/outage/receipt cases.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const bundled=process.argv[2];assert(bundled,"Pass compiled queue module");
const {processDeadLetterBatch}=await import(pathToFileURL(bundled).href);
const good="00000000-0000-4000-8000-000000000001",id="00000000-0000-4000-8000-000000000002";
function message(body){return {body,ackCount:0,retryCount:0,ack(){this.ackCount++},retry(){this.retryCount++}};}
function scenario({known=true,storageFails=false,receiptPresent=false}={}){
 const state={incidentOpen:false,incidentClosed:false,mutations:[],selects:0};
 const DB={prepare(sql){return {bind(...args){return {
  async first(){
   state.selects++;
   if(storageFails)throw Error("D1 unavailable");
   if(sql.startsWith("SELECT id FROM devices"))return known?{id:good}:null;
   if(sql.startsWith("SELECT id FROM health_incidents"))return state.incidentOpen?{id:"incident"}:null;
   if(sql.startsWith("SELECT 1 AS ok FROM safety_events"))return receiptPresent?{ok:1}:null;
   throw Error("Unexpected query "+sql);
  },
  async run(){state.mutations.push({sql,args});if(sql.includes("SET ended_at"))state.incidentClosed=true;return {meta:{changes:1}};},
  };}};},async batch(stmts){state.mutations.push(...stmts);state.incidentOpen=true;return stmts.map(()=>({meta:{changes:1}}));}};
 return {state,env:{DB,HISTORY:{}}};
}
const safety={type:"safety_receipt",deviceId:good,eventId:id,kind:"sos_started",createdAtMs:Date.now()};
{
 const m=message({...safety,deviceId:"bad/device"}),{env,state}=scenario();
 await processDeadLetterBatch({queue:"brick-family-v1-dlq",messages:[m]},env);
 assert.equal(m.ackCount,1);assert.equal(m.retryCount,0);assert.equal(state.mutations.length,0);
}
{
 const m=message(safety),{env,state}=scenario({known:false});
 await processDeadLetterBatch({queue:"brick-family-v1-dlq",messages:[m]},env);
 assert.equal(m.ackCount,1);assert.equal(state.mutations.length,0);
}
{
 const m=message(safety),{env,state}=scenario({storageFails:true});
 await processDeadLetterBatch({queue:"brick-family-v1-dlq",messages:[m]},env);
 assert.equal(m.ackCount,0,"D1 outage must not ACK");assert.equal(m.retryCount,1);
}
{
 const m=message(safety),{env,state}=scenario();
 await processDeadLetterBatch({queue:"brick-family-v1-dlq",messages:[m]},env);
 assert.equal(m.ackCount,0,"missing safety row must remain queued");assert.equal(m.retryCount,1);
 assert.equal(state.incidentOpen,true);assert.equal(state.incidentClosed,false);
}
{
 const m=message(safety),{env,state}=scenario({receiptPresent:true});
 await processDeadLetterBatch({queue:"brick-family-v1-dlq",messages:[m]},env);
 assert.equal(m.ackCount,1,"durable receipt can ACK");assert.equal(m.retryCount,0);
 assert.equal(state.incidentOpen,true);assert.equal(state.incidentClosed,true);
}
{
 const m=message({type:"unknown_poison",deviceId:good}),{env,state}=scenario();
 await processDeadLetterBatch({queue:"brick-family-v1-dlq",messages:[m]},env);
 assert.equal(m.ackCount,1,"invalid non-replayable poison must be explicitly triaged");
 assert.equal(state.incidentOpen,true,"poison must leave a durable incident");
 assert.equal(state.incidentClosed,false,"poison cannot be falsely marked recovered");
}
console.log("PASS 8D.9: six actual DLQ scenarios cover malformed/unknown, D1 outage, missing and durable SOS receipt, poison with unrecovered incident; real Cloudflare retry exhaustion remains pending");
