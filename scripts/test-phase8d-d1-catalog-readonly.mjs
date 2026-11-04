import assert from "node:assert/strict";
import {inspectD1Catalog} from "./phase8d-d1-catalog-readonly.mjs";
const id="a".repeat(32),prod="brick-family-v1",dev=prod+"-dev";
const prodID="11111111-1111-4111-8111-111111111111",devID="22222222-2222-4222-8222-222222222222";
async function check(opts={}){
 const calls=[];
 const request=async(url,init)=>{
  assert.equal(init.method,"GET");assert.equal(init.redirect,"error");
  const x=new URL(url);assert.equal(x.origin,"https://api.cloudflare.com");assert(x.pathname.endsWith("/d1/database"));
  const name=x.searchParams.get("name");assert([prod,dev].includes(name));
  assert.equal(x.searchParams.get("per_page"),"100");
  assert(!Object.hasOwn(init.headers,"Cookie"));calls.push(x.pathname+x.search);
  if(opts.denied)return {ok:false,status:403};
  const uuid=opts.same?prodID:name===prod?prodID:devID;
  const rows=opts.missing&&name===dev?[]:[{name,uuid}];
  return {ok:true,status:200,async json(){return {success:true,result:rows,result_info:{total_pages:1}}}};
 };
 return {r:await inspectD1Catalog({token:opts.token===false?null:"fake-audit",accountId:opts.id??id,request}),calls};
}
const good=await check();
assert.equal(good.r.status,"ATTESTED");assert.equal(good.r.databasesDistinct,true);assert.equal(good.calls.length,2);
assert(!JSON.stringify(good.r).includes(prodID),"no UUID should be printed in saved audit proof");
assert.equal((await check({same:true})).r.status,"FAIL");
assert.equal((await check({missing:true})).r.status,"DRIFT");
assert.equal((await check({denied:true})).r.status,"BLOCKED");
const noToken=await check({token:false});assert.equal(noToken.calls.length,0);assert.equal(noToken.r.status,"BLOCKED");
const malformed=await check({id:"not-an-account"});assert.equal(malformed.calls.length,0);
console.log("PASS P8D-045: Cloudflare D1 GET-only catalog, prod/dev UUID isolation, missing/duplicate permission denial and malformed account fail-closed; no SQL/user data");
