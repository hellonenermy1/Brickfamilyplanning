import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
const {processHistoryBatch}=await import(pathToFileURL(process.argv[2]).href);
const mk=body=>({body,ackCount:0,retryCount:0,ack(){this.ackCount++},retry(){this.retryCount++}});
const id="00000000-0000-4000-8000-000000000001";
const partial={type:"location",deviceId:id,packet:{epoch:1,sequence:2,wallTimeMs:1793000000000},rawPacket:{}};
const wrong={type:"location",deviceId:id,packet:{epoch:1,sequence:3,wallTimeMs:1793000000000,trustedLatE7:910000000, trustedLonE7:1038000000}};
const messages=[mk(null),mk(undefined),mk(42),mk(partial),mk(wrong),mk({type:"unknown",deviceId:id})];
const storage={async get(){throw Error("malformed Queue data touched R2")},async head(){throw Error("malformed Queue data touched R2")},async put(){throw Error("malformed Queue data touched R2")}};
const result=await processHistoryBatch({messages},{HISTORY:storage});
for(const [i,m] of messages.entries()){
 assert.equal(m.ackCount,1,"poison Queue body "+i+" not explicitly ACKed/triaged");
 assert.equal(m.retryCount,0,"poison Queue body "+i+" retried forever");
}
assert.equal(result.ignoredMessages,messages.length);
assert.equal(result.retriedMessages,0);
console.log("PASS 8D.9: null/undefined/scalar/truncated/out-of-bounds/unknown Queue messages quarantined without crashing batch or touching R2");
