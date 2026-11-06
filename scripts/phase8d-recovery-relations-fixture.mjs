// Populated synthetic recovery graph; never use real coordinates/credentials.
// Independent all-column parity and joined-link assertions, not row-count proof.
import assert from 'node:assert/strict';
export const relationTables=['geofences','geofence_state','ble_anchors','retention_settings','learned_place_models','device_wifi_schedules','device_wifi_schedule_result','device_capability_profile','witness_authorizations','ground_receivers','witness_aliases','witness_sightings','ground_sightings','evidence_batches','evidence_records','evidence_batch_records'];
const clean=v=>JSON.parse(JSON.stringify(v));
async function rows(db,table){return clean((await db.prepare('SELECT * FROM '+table).all()).results).sort((a,b)=>JSON.stringify(Object.keys(a).sort().map(k=>a[k])).localeCompare(JSON.stringify(Object.keys(b).sort().map(k=>b[k]))));}
export async function readRecoveryRelations(db){return Object.fromEntries(await Promise.all(relationTables.map(async t=>[t,await rows(db,t)])));}
export async function seedRecoveryRelations(db,{a,b,now}){
 const seeds={};const add=(t,r)=>(seeds[t]??=[]).push(r);
 for(const [i,device] of [a,b].entries()){
  const fence='synthetic-place-'+i;
  add('geofences',{id:fence,device_id:device,name:i?'Synthetic quiet place':'Synthetic café "north"',latitude:1.125+i,longitude:4.25+i,radius_m:75+i,enabled:1-i,created_at:now-400});
  add('geofence_state',{geofence_id:fence,device_id:device,stable_state:i?'outside':'inside',candidate_state:i?null:'outside',candidate_since:i?null:now-100,candidate_count:i?0:2,last_distance_m:12.5+i,updated_at:now-50,last_epoch:4,last_sequence:20+i});
  add('ble_anchors',{geofence_id:fence,device_id:device,beacon_uuid:'synthetic-beacon-'+i,created_at:now-300,updated_at:now-200});
  add('retention_settings',{device_id:device,safety_event_days:i?365:60,updated_at:now-200});
  add('learned_place_models',{device_id:device,geofence_id:fence,model_version:2,trusted_visits:8+i,last_trusted_visit_ms:now-200,last_match_ms:i?null:now-100,state:i?'learning':'trusted',updated_at:now-50});
  add('device_wifi_schedules',{id:'shared-id',device_id:device,enabled:1-i,target_enabled:i,local_minute_of_day:550+i,days_mask:i?65:31,grace_minutes:5+i,updated_at:now-200});
  add('device_wifi_schedule_result',{device_id:device,schedule_id:'shared-id',target_enabled:i,actual_enabled:i?null:0,status:i?'failed':'applied',attempted_at:now-150,detail:i?'synthetic unavailable':null,received_at:now-100});
  add('device_capability_profile',{device_id:device,profile_version:3,profile_json:JSON.stringify({synthetic:true,enabled:!i,nested:{text:'value "quoted" café',empty:null}}),device_updated_at:now-150,received_at:now-100});
  add('witness_authorizations',{device_id:device,witness_device_id:i?a:b,enabled:1-i,created_at:now-300,updated_at:now-200});
  add('ground_receivers',{id:'synthetic-receiver-'+i,device_id:device,name:'Synthetic receiver '+i,latitude:i?null:1.125,longitude:i?null:4.25,radius_m:i?null:40,public_key_spki_b64:null,enabled:1-i,created_at:now-300,updated_at:now-200});
  add('witness_aliases',{alias:String(i+1).repeat(16),child_device_id:device,slot:50+i,valid_from_ms:now-1000,valid_to_ms:now+1000,source_record_id:'synthetic-alias-'+i,created_at:now-100,expires_at:now+1000});
  add('witness_sightings',{record_id:'synthetic-sighting-'+i,alias:String(i+1).repeat(16),witness_device_id:i?a:b,child_device_id:device,observed_wall_ms:now-100,witness_latitude:1.125,witness_longitude:4.25,witness_accuracy_m:10,rssi:-65-i,tx_power:i?null:-10,proximity_allowance_m:30,uncertainty_m:40,authorised:1-i,received_at:now-50});
  add('ground_sightings',{receiver_id:'synthetic-receiver-'+i,sighting_id:'shared-sighting',alias:String(i+1).repeat(16),child_device_id:i?null:device,observed_wall_ms:now-100,receiver_latitude:1.125,receiver_longitude:4.25,receiver_radius_m:40,rssi:-65,tx_power:null,proximity_allowance_m:30,uncertainty_m:40,resolved:1-i,payload_sha256:'a'.repeat(64),received_at:now-50});
  add('evidence_batches',{device_id:device,batch_id:'shared-batch',protocol:1,record_count:1,byte_length:17,payload_sha256:'b'.repeat(64),r2_key:'evidence/raw/synthetic',received_at:now-50});
  add('evidence_records',{device_id:device,epoch:5,sequence:1,record_id:'shared-record',provider:1,family:1,capability:1,health:1,quality:1,independence_group:'synthetic-'+i,elapsed_realtime_ms:100,wall_time_ms:now-100,payload_sha256:'c'.repeat(64),first_seen_at:now-50});
  add('evidence_batch_records',{device_id:device,batch_id:'shared-batch',record_id:'shared-record',epoch:5,sequence:1});
 }
 add('device_wifi_schedules',{id:'second-schedule',device_id:a,enabled:0,target_enabled:1,local_minute_of_day:1439,days_mask:127,grace_minutes:120,updated_at:now-200});
 for(const table of relationTables)for(const row of seeds[table]){const keys=Object.keys(row);await db.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])).run();}
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 const expected=await readRecoveryRelations(db);
 for(const t of relationTables){assert.equal(expected[t].length,seeds[t].length);for(const seed of seeds[t])assert(expected[t].some(row=>Object.keys(seed).every(k=>row[k]===seed[k])),t+' seed values must actually exist');}
 return expected;
}
export async function assertRecoveryRelations(db,expected){
 assert.deepEqual(await readRecoveryRelations(db),expected,'all populated configuration/relationship columns must retain exact values');
 const q=async sql=>clean((await db.prepare(sql).all()).results);
 assert.deepEqual(await q('PRAGMA foreign_key_check'),[]);
 const places=await q('SELECT g.id,g.device_id,s.stable_state,b.beacon_uuid,m.trusted_visits FROM geofences g JOIN geofence_state s ON s.geofence_id=g.id AND s.device_id=g.device_id JOIN ble_anchors b ON b.geofence_id=g.id AND b.device_id=g.device_id JOIN learned_place_models m ON m.geofence_id=g.id AND m.device_id=g.device_id');assert.equal(places.length,2);
 const schedules=await q('SELECT s.device_id,s.id,r.status FROM device_wifi_schedules s JOIN device_wifi_schedule_result r ON r.device_id=s.device_id AND r.schedule_id=s.id');assert.equal(schedules.length,2);assert.equal(new Set(schedules.map(r=>r.device_id)).size,2);
 const evidence=await q('SELECT l.device_id,l.batch_id,l.record_id,r.independence_group FROM evidence_batch_records l JOIN evidence_batches b ON b.device_id=l.device_id AND b.batch_id=l.batch_id JOIN evidence_records r ON r.device_id=l.device_id AND r.record_id=l.record_id AND r.epoch=l.epoch AND r.sequence=l.sequence');assert.equal(evidence.length,2);assert.equal(new Set(evidence.map(r=>r.device_id)).size,2);
 const sightings=await q('SELECT s.child_device_id,a.enabled FROM witness_sightings s JOIN witness_authorizations a ON a.device_id=s.child_device_id AND a.witness_device_id=s.witness_device_id JOIN witness_aliases w ON w.alias=s.alias AND w.child_device_id=s.child_device_id');assert.equal(sightings.length,2);assert.deepEqual(sightings.map(r=>r.enabled).sort(),[0,1]);
 return{tables:relationTables.length,rows:Object.values(expected).reduce((n,r)=>n+r.length,0),joinedPlaces:places.length,joinedSchedules:schedules.length,joinedEvidence:evidence.length,joinedWitnesses:sightings.length};
}
export async function seedRecoveryActions(db,{a,b,now}){
 const pendingLocation={device_id:a,desired_enabled:0,command_id:'synthetic-location-pending',issued_at:now-200,updated_at:now-100,last_actual_enabled:1,last_actual_at:now-150,last_acked_command_id:null,command_status:'pending',completed_at:null,result_actual_enabled:null,result_success:null,result_reason:null};
 const completedLocation={device_id:b,desired_enabled:1,command_id:'synthetic-location-completed',issued_at:now-300,updated_at:now-100,last_actual_enabled:1,last_actual_at:now-150,last_acked_command_id:'synthetic-location-completed',command_status:'completed',completed_at:now-100,result_actual_enabled:1,result_success:1,result_reason:'synthetic prior completion'};
 const pendingLive={device_id:a,command_id:'synthetic-live-pending',requested_active:1,issued_at:now-200,expires_at:now+3600000,command_status:'pending',last_actual_active:0,completed_at:null,result_reason:null};
 const completedLive={device_id:b,command_id:'synthetic-live-completed',requested_active:0,issued_at:now-300,expires_at:now+3600000,command_status:'completed',last_actual_active:0,completed_at:now-100,result_reason:'synthetic prior completion'};
 for(const [table,values]of [['device_location_control',[pendingLocation,completedLocation]],['device_live_track_control',[pendingLive,completedLive]]])for(const row of values){const keys=Object.keys(row);await db.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k])).run();}
 return{a,b,pendingLocation,completedLocation,pendingLive,completedLive};
}
export async function assertRetiredRecoveryActions(db,fixture,notBefore){
 const location=await rows(db,'device_location_control'),live=await rows(db,'device_live_track_control');
 const pendingLocation=location.find(r=>r.device_id===fixture.a),pendingLive=live.find(r=>r.device_id===fixture.a);
 for(const row of [pendingLocation,pendingLive]){assert.equal(row.command_status,'expired');assert.equal(row.result_reason,'cancelled_on_disaster_restore');assert(row.completed_at>=notBefore&&row.completed_at<=Date.now());}
 assert.equal(pendingLocation.result_success,0);
 assert.deepEqual(pendingLocation,{...fixture.pendingLocation,command_status:'expired',completed_at:pendingLocation.completed_at,result_success:0,result_reason:'cancelled_on_disaster_restore'});
 assert.deepEqual(pendingLive,{...fixture.pendingLive,command_status:'expired',completed_at:pendingLive.completed_at,result_reason:'cancelled_on_disaster_restore'});
 assert.deepEqual(location.find(r=>r.device_id===fixture.b),fixture.completedLocation);assert.deepEqual(live.find(r=>r.device_id===fixture.b),fixture.completedLive);
 return{location,live};
}
