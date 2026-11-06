import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('src/parent-v5.ts','utf8');
const start=source.indexOf('function renderHealthChecks(){');
const end=source.indexOf('async function loadHealthOps()',start);
assert(start>0&&end>start,'original Health dashboard rendering must still exist');
const rows=[];
const root={replaceChildren(){rows.length=0},append(row){rows.push(row)}};
const summary={className:'',textContent:''};
const ctx=vm.createContext({
 snapshot:{health:{}},
 $:id=>id==='#healthChecks'?root:id==='#healthSummary'?summary:null,
 healthValue:(label,value,good)=>({label,value,good}),
 yes:x=>x===true?'yes':x===false?'no':'unknown',
 fmtAge:ms=>Math.round(ms/1000)+' s',
 fmtDur:ms=>Math.round(ms/60000)+' min',
 Math,Number,String
});
vm.runInContext(source.slice(start,end),ctx,{timeout:1000});
ctx.renderHealthChecks();
const get=name=>rows.find(r=>r.label===name);
for(const name of ['Sensors','Network','Background execution','Battery optimization','Local queue','Safety queue','Service uptime','Managed mode','App version']){
 const row=get(name);
 assert(row,'missing Health metric '+name);
 assert.equal(row.good,null,'unknown '+name+' must never show healthy');
 assert.match(row.value,/Not reported/,'unknown '+name+' must say not reported');
}
assert.notEqual(summary.className,'notice','unknown heartbeat must not show green');
ctx.snapshot={health:{accelerometerAvailable:true,gyroscopeAvailable:true,network:'wifi',networkValidated:true,backgroundRestricted:false,batteryOptimizationExempt:true,pendingRecords:0,pendingSafetyEvents:0,serviceUptimeMs:600000,managed:true,appVersion:'1.0.0-beta.2',operationalStatus:'healthy'}};
ctx.renderHealthChecks();
for(const name of ['Sensors','Network','Background execution','Battery optimization','Local queue','Safety queue','Service uptime','Managed mode','App version'])assert.equal(get(name).good,true,'measured healthy '+name);
ctx.snapshot={health:{accelerometerAvailable:false,gyroscopeAvailable:true,network:'offline',networkValidated:false,backgroundRestricted:true,batteryOptimizationExempt:false,pendingRecords:20,pendingSafetyEvents:4,managed:false}};
ctx.renderHealthChecks();
for(const name of ['Sensors','Network','Background execution','Battery optimization','Local queue','Safety queue'])assert.equal(get(name).good,false,'reported unhealthy '+name);
assert.equal(get('Managed mode').value,'Standard app','explicit non-DO must be shown accurately');
console.log('PASS Phase2 Health truth: unknown is not green, measured healthy stays green, explicit failures visible');
