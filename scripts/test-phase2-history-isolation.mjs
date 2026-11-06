import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('src/parent-beta.ts','utf8');
const start=source.indexOf('let p2HistoryRequest=0;');
const end=source.indexOf('async function p2LoadObservationLogs()',start);
assert(start>0&&end>start,'Phase2 history isolation must be injected into parent bundle');
const pending=[],rendered=[],notes=[],seek={value:'4',max:'99'};
const ctx=vm.createContext({
 currentDevice:'phone-A',historyPoints:[{wallTimeMs:999}],displayPoints:[{}],playIndex:4,playMarker:null,
 stopCount:0,stopPlay:()=>{ctx.stopCount++;},
 selectDevice:async id=>{ctx.currentDevice=id;},
 drawHistory:points=>rendered.push({device:ctx.currentDevice,points}),
 renderTimeline:()=>{},
 map:{isStyleLoaded:()=>true,getSource:()=>null},
 document:{getElementById:id=>id==='seek'?seek:null},
 text:(id,txt)=>notes.push([id,txt]),
 setPlayPoint:i=>{ctx.playIndex=i;},
 api:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject})),
 fmtDur:n=>String(n),
 Number,Date,Math,JSON,Array,String,Boolean,Error
});
vm.runInContext(source.slice(start,end),ctx,{timeout:1000});
const beginA=ctx.fetchHistory(100,200);
assert(pending[0]?.url?.includes('phone-A/history'),'first history API request must be scheduled');
await ctx.selectDevice('phone-B');
assert.equal(ctx.historyPoints.length,0,'switch must clear history evidence and old marker');
assert.equal(seek.value,'0','switch must clear playback seek position');
const beginB=ctx.fetchHistory(100,200);
assert(pending[1].url.includes('phone-B/history'));
pending[0].resolve({points:[{recordId:'A',wallTimeMs:150}],summary:{}});
await beginA;
assert.equal(ctx.historyPoints.length,0,'late A response must never overwrite B');
pending[1].resolve({points:[{recordId:'B',wallTimeMs:151}],displayPoints:[{recordId:'B',wallTimeMs:151}],summary:{}});
await beginB;
assert.equal(ctx.historyPoints[0].recordId,'B','B history must render for selected B only');
assert(rendered.some(x=>x.device==='phone-B'&&x.points.some(p=>p.recordId==='B')),'route must use current device');
assert(!rendered.some(x=>x.points.some(p=>p.recordId==='A')),'A path must never appear in B');
const prior=ctx.fetchHistory(201,250),newer=ctx.fetchHistory(251,300);
pending[2].resolve({points:[{recordId:'old',wallTimeMs:222}],summary:{}});
await prior;
assert.equal(ctx.historyPoints.length,0,'stale overlapping request must not replace newer range');
pending[3].resolve({points:[{recordId:'new',wallTimeMs:270}],summary:{}});
await newer;
assert.equal(ctx.historyPoints[0].recordId,'new');
assert(ctx.stopCount>=3,'playback timer stopped on changing range/device');
assert.equal(ctx.p2HistoryResponseCurrent('phone-A',1,'phone-B',1),false);
assert.equal(ctx.p2HistoryResponseCurrent('phone-B',2,'phone-B',2),true);
console.log('PASS Phase2 History isolation: cross-device late response, overlapping ranges, seek reset, valid route');
