import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateBetaConfig} from './beta-deployment-contract.mjs';
const c=JSON.parse(fs.readFileSync('wrangler.beta.template.jsonc','utf8'));assert.equal(validateBetaConfig(c),true);
for(const mutate of [x=>x.name='brick-family-v1',x=>x.main='src/worker-v10.ts',x=>x.vars.APP_ENV='development',x=>x.d1_databases[0].database_name='brick-family-v1',x=>x.r2_buckets[0].bucket_name='brick-family-v1-history',x=>x.queues.producers[0].queue='brick-family-v1-events',x=>x.queues.consumers[0].dead_letter_queue='brick-family-v1-dlq',x=>x.durable_objects.bindings[0].script_name='brick-family-v1',x=>x.ratelimits[0].namespace_id='41001']){const bad=structuredClone(c);mutate(bad);assert.throws(()=>validateBetaConfig(bad));}
const rendered=structuredClone(c);rendered.vars.BETA_SOURCE_SHA='a'.repeat(40);rendered.d1_databases[0].database_id='11111111-1111-4111-8111-111111111111';rendered.d1_databases[1].database_id='22222222-2222-4222-8222-222222222222';assert.equal(validateBetaConfig(rendered,{rendered:true}),true);rendered.d1_databases[1].database_id=rendered.d1_databases[0].database_id;assert.throws(()=>validateBetaConfig(rendered,{rendered:true}));
console.log('PASS beta deployment rejects production/development worker, storage, queue, DO and rate bindings and database aliasing');
