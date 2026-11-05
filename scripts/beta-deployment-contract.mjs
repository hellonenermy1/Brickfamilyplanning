export function validateBetaConfig(c,{rendered=false}={}){
 const fail=()=>{throw Error('Refuse configuration outside isolated D1/card-free beta');};
 if(c.name!=='brick-family-beta'||c.main!=='src/worker-beta-cardfree.ts'||c.vars?.APP_ENV!=='development'||c.vars?.DEV_PARENT_AUTH_MODE!=='d1-session-v1'||c.vars?.BETA_STORAGE_MODE!=='d1'||c.vars?.BETA_CHANNEL!=='beta'||c.vars.CURRENT_APP_VERSION!=='1.0.0-beta.1')fail();
 if(['r2_buckets','queues','services','dispatch_namespaces'].some(k=>k in c)||Object.keys(c.vars).some(k=>k.startsWith('CF_ACCESS_')||/TOKEN|PASSWORD|SECRET|LOGIN_HASH/.test(k)))fail();
 if(JSON.stringify(c.triggers?.crons)!==JSON.stringify([])||c.migrations?.length!==2||JSON.stringify(c.migrations[0].new_sqlite_classes)!==JSON.stringify(['BrickDevice'])||c.migrations[0].new_classes||JSON.stringify(c.migrations[1].new_sqlite_classes)!==JSON.stringify(['BetaScheduler'])||c.migrations[1].new_classes)fail();
 const db=c.d1_databases;if(db?.length!==2||db.find(x=>x.binding==='DB')?.database_name!=='brick-family-beta'||db.find(x=>x.binding==='BETA_DB')?.database_name!=='brick-family-beta-diagnostics')fail();
 if(c.durable_objects?.bindings?.length!==2||c.durable_objects.bindings.some(x=>x.script_name)||c.durable_objects.bindings.find(x=>x.name==='BRICK_DEVICE')?.class_name!=='BrickDevice'||c.durable_objects.bindings.find(x=>x.name==='BETA_SCHEDULER')?.class_name!=='BetaScheduler')fail();
 if(c.ratelimits?.length!==9||new Set(c.ratelimits.map(x=>x.namespace_id)).size!==9||c.ratelimits.some(x=>!/^5100[1-9]$/.test(x.namespace_id))||!c.ratelimits.some(x=>x.name==='PARENT_LOGIN_RATE'))fail();
 if(rendered){if(db.some(x=>!/^[a-f0-9-]{36}$/i.test(x.database_id))||db[0].database_id===db[1].database_id||!/^[a-f0-9]{40}$/.test(c.vars.BETA_SOURCE_SHA)||!/^https:\/\/(?:build\.protomaps\.com)\/[0-9]{8}\.pmtiles$/.test(c.vars.BRICK_MAP_SOURCE))fail();}
 return true;
}
