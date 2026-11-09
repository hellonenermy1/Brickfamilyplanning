// Synthetic Worker fixture source only. Never import this into production.
// Trusted fixture controls initialize state; normal writer operations always use
// the actual signed V2 client/handler and native durable replay/authority.
export function signedWriterFixture({url,captureSecret,writerSecret,quarantine=false}){
 if(typeof quarantine!=='boolean')throw Error('synthetic quarantine option');
 if(!/^https:\/\/capture\.fixture\.invalid\//.test(url)||![captureSecret,writerSecret].every(s=>/^[a-f0-9]{64}$/.test(s))||captureSecret===writerSecret)throw Error('synthetic fixture configuration');
 return `import {createCaptureBrokerClient} from './src/capture-broker-client.ts';
const fixtureIdentity={sourceSha:'a'.repeat(40),resourceSetSha256:'2c7d4b00cc25648bf85d8473a0dab35f9617873ea8898091d12ec61352f19ffc'},fixtureUrl=${JSON.stringify(url)};
const fixtureKeys=[{id:'fixture-capture',role:'capture',bytes:Uint8Array.from('${captureSecret}'.match(/../g),v=>parseInt(v,16))},{id:'fixture-writer',role:'runtime-writer',bytes:Uint8Array.from('${writerSecret}'.match(/../g),v=>parseInt(v,16))}];
const fixtureClients=new WeakMap();function install(owner,ctx,env){if(stagedCaptureWriterConfigured(owner))return;
 let pending=fixtureClients.get(env.CAPTURE_AUTHORITY);if(!pending){pending=(async()=>{const stub=env.CAPTURE_AUTHORITY.get(env.CAPTURE_AUTHORITY.idFromName('controlled-writer-envelope'));const bootstrap=await stub.invoke('initialize',[fixtureIdentity]);return createCaptureBrokerClient({url:fixtureUrl,pin:{...fixtureIdentity,authorityEpoch:bootstrap.authorityEpoch},key:fixtureKeys[1],request:(url,init)=>env.CAPTURE_AUTHORITY.get(env.CAPTURE_AUTHORITY.idFromName('controlled-writer-envelope')).fetch(url,init)});})();fixtureClients.set(env.CAPTURE_AUTHORITY,pending);}
 const controller=async()=> (await pending).runtimeController(code=>console.log('synthetic writer notice '+code));
 installStagedCaptureWriterController(owner,{getScope:async()=>await(await controller()).getScope(),enterDescendantWriter:async(id,parent)=>(await controller()).enterDescendantWriter(id,parent),enterWriter:async(id,priority)=>(await controller()).enterWriter(id,priority),startWriter:async(t,p)=>(await controller()).startWriter(t,p),cancelReservation:async(id,p)=>(await controller()).cancelReservation(id,p),exitWriter:async t=>(await controller()).exitWriter(t),${quarantine?"quarantineUrgent:(id,operation)=>env.CAPTURE_QUARANTINE.get(env.CAPTURE_QUARANTINE.idFromName('controlled-outage-guard')).invoke('quarantineUrgent',[fixtureIdentity,id,operation]),":''}notice(code){console.log('synthetic writer notice '+code);}});
}
`;
}
