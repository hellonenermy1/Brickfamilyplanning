export function validateBetaConfig(c,{rendered=false}={}){
 const fail=()=>{throw Error('Refuse non-isolated beta configuration');};
 if(c.name!=='brick-family-beta'||c.main!=='src/worker-beta.ts'||c.vars?.APP_ENV!=='production'||c.vars?.BETA_CHANNEL!=='beta'||c.vars.CURRENT_APP_VERSION!=='1.0.0-beta.1')fail();
 const db=c.d1_databases;if(db?.length!==2||db.find(x=>x.binding==='DB')?.database_name!=='brick-family-beta'||db.find(x=>x.binding==='BETA_DB')?.database_name!=='brick-family-beta-diagnostics')fail();
 if(c.r2_buckets?.length!==2||c.r2_buckets.find(x=>x.binding==='HISTORY')?.bucket_name!=='brick-family-beta-history'||c.r2_buckets.find(x=>x.binding==='MAPS')?.bucket_name!=='brick-family-beta-maps')fail();
 if(c.queues?.producers?.length!==1||c.queues.producers[0].binding!=='EVENTS'||c.queues.producers[0].queue!=='brick-family-beta-events'||c.queues.consumers?.length!==2)fail();
 const q=c.queues.consumers;if(q.find(x=>x.queue==='brick-family-beta-events')?.dead_letter_queue!=='brick-family-beta-dlq'||!q.some(x=>x.queue==='brick-family-beta-dlq')||q.some(x=>!['brick-family-beta-events','brick-family-beta-dlq'].includes(x.queue)))fail();
 if(c.durable_objects?.bindings?.length!==1||c.durable_objects.bindings[0].name!=='BRICK_DEVICE'||c.durable_objects.bindings[0].class_name!=='BrickDevice'||c.durable_objects.bindings[0].script_name)fail();
 if(c.ratelimits?.length!==8||new Set(c.ratelimits.map(x=>x.namespace_id)).size!==8||c.ratelimits.some(x=>!/^5100[1-8]$/.test(x.namespace_id)))fail();
 if(rendered){if(db.some(x=>!/^[a-f0-9-]{36}$/i.test(x.database_id))||db[0].database_id===db[1].database_id||!/^[a-f0-9]{40}$/.test(c.vars.BETA_SOURCE_SHA))fail();}
 return true;
}
