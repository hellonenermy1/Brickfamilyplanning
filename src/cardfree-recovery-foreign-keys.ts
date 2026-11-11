// Reviewed effective primary migration relationship contracts (001..022 plus beta
// compatibility columns). SQLite FK IDs/clause order are not semantic identity.
// Diagnostics currently declares no FKs. Schema changes require explicit review.
type ForeignKey={table:string;onUpdate:string;onDelete:string;match:string;columns:[string,string][]};
const REVIEWED:Record<string,ForeignKey[]>={
 "atlas_models":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "ble_anchors":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]},{"table":"geofences","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["geofence_id","id"]]}],
 "commute_summaries":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "crash_reports":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["device_id","id"]]}],
 "dev_object_chunks":[{"table":"dev_object_store","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["key","key"]]}],
 "device_capability_profile":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "device_commands":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "device_evidence_state":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "device_health_samples":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["device_id","id"]]}],
 "device_live_track_control":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "device_location_control":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "device_replay_state":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "device_wifi_schedule_result":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "device_wifi_schedules":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "evidence_batch_records":[{"table":"evidence_batches","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","device_id"],["batch_id","batch_id"]]},{"table":"evidence_records","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","device_id"],["record_id","record_id"],["epoch","epoch"],["sequence","sequence"]]}],
 "evidence_batches":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "evidence_provider_health":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "evidence_records":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "geofence_state":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["device_id","id"]]},{"table":"geofences","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["geofence_id","id"]]}],
 "geofences":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["device_id","id"]]}],
 "ground_receivers":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "ground_sightings":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["child_device_id","id"]]},{"table":"ground_receivers","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["receiver_id","id"]]}],
 "health_incidents":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["device_id","id"]]}],
 "learned_place_models":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]},{"table":"geofences","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["geofence_id","id"]]}],
 "phase5_hypothesis_frames":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "phase5_precise_endpoints":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "phase5_refined_intervals":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "refined_history_runs":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "retention_settings":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["device_id","id"]]}],
 "safety_events":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["device_id","id"]]}],
 "screen_time_daily":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]}],
 "trips":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"NO ACTION","match":"NONE","columns":[["device_id","id"]]}],
 "witness_aliases":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["child_device_id","id"]]}],
 "witness_authorizations":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["device_id","id"]]},{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["witness_device_id","id"]]}],
 "witness_sightings":[{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["child_device_id","id"]]},{"table":"devices","onUpdate":"NO ACTION","onDelete":"CASCADE","match":"NONE","columns":[["witness_device_id","id"]]}],
};
export function assertRecoveryForeignKeys(table:string,value:unknown,primary:boolean){
 const refuse=()=>{throw Error('recovery foreign-key schema mismatch: '+table);};
 if(typeof value!=='string'||value.length>65536)refuse();
 let rows:unknown;try{rows=JSON.parse(value as string);}catch{refuse();}
 if(!Array.isArray(rows)||rows.length>128)refuse();
 const groups=new Map<number,{descriptor:ForeignKey;parts:Map<number,[string,string]>}>();
 for(const r of rows as Record<string,unknown>[]){
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='from,id,match,on_delete,on_update,seq,table,to'||!Number.isSafeInteger(r.id)||(r.id as number)<0||!Number.isSafeInteger(r.seq)||(r.seq as number)<0||(r.seq as number)>127||['table','from','to','on_update','on_delete','match'].some(k=>typeof r[k]!=='string'))refuse();
  const descriptor:ForeignKey={table:r.table as string,onUpdate:r.on_update as string,onDelete:r.on_delete as string,match:r.match as string,columns:[]};
  let g=groups.get(r.id as number);if(!g){g={descriptor,parts:new Map()};groups.set(r.id as number,g);}
  if(JSON.stringify(g.descriptor)!==JSON.stringify(descriptor)||g.parts.has(r.seq as number))refuse();
  g.parts.set(r.seq as number,[r.from as string,r.to as string]);
 }
 const actual:string[]=[];
 for(const g of groups.values()){
  const columns:[string,string][]=[];
  for(let i=0;i<g.parts.size;i++){const part=g.parts.get(i);if(!part)refuse();columns.push(part!);}
  actual.push(JSON.stringify({...g.descriptor,columns}));
 }
 const expected=(primary&&Object.hasOwn(REVIEWED,table)?REVIEWED[table]:[]).map(k=>JSON.stringify(k)).sort();
 if(JSON.stringify(actual.sort())!==JSON.stringify(expected))refuse();
}

// Validate declared FK tuples before sealing a package or writing a fresh target.
// Index each referenced parent tuple once; composite keys stay grouped. SQLite
// exempts a child tuple containing NULL, including optional unresolved sightings.
export function assertRecoveryRelationships(store:{tables:Record<string,Record<string,unknown>[]>}){
 const indexes=new Map<string,Set<string>>();
 for(const [table,rows]of Object.entries(store.tables))for(const fk of REVIEWED[table]??[]){
  const fail=()=>{throw Error('recovery relationship data mismatch: '+table);};
  const parents=store.tables[fk.table];if(!Array.isArray(parents))fail();
  const parentColumns=fk.columns.map(c=>c[1]),identity=JSON.stringify([fk.table,parentColumns]);
  let keys=indexes.get(identity);
  if(!keys){keys=new Set(parents.map(row=>JSON.stringify(parentColumns.map(c=>row[c]))));indexes.set(identity,keys);}
  for(const row of rows){const values=fk.columns.map(c=>row[c[0]]);if(values.some(v=>v===null))continue;if(!keys.has(JSON.stringify(values)))fail();}
 }
}
