#!/usr/bin/env node
// Phase 8D.11: real RSA-2048 Access JWT validation against fake JWKS, never live Cloudflare.
// Cover algorithm confusion, audience/issuer, signature tamper, timestamps, production session bypass.
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";
if (!globalThis.crypto) globalThis.crypto=webcrypto;
const [modulePath]=process.argv.slice(2);
if(!modulePath)throw Error("usage: test-phase8d-cloudflare-access-jwt.mjs <access-auth bundle>");
const auth=await import(pathToFileURL(modulePath).href);
const pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
const key={...(await crypto.subtle.exportKey("jwk",pair.publicKey)),kid:"test-rsa-kid",use:"sig",alg:"RS256"};
const teamDomain="https://brick-test-identity.cloudflareaccess.com";
const expectedAudience="brick-test-parent";
const env={APP_ENV:"production",CF_ACCESS_TEAM_DOMAIN:teamDomain,CF_ACCESS_AUD:expectedAudience};
const originalFetch=globalThis.fetch;
let jwksRequests=0;
globalThis.fetch=async url=>{
 assert.equal(String(url),teamDomain+"/cdn-cgi/access/certs","must request JWKS only from pinned Access team");
 jwksRequests++;
 return Response.json({keys:[key]});
};
const b64=x=>Buffer.from(typeof x==="string"?x:JSON.stringify(x)).toString("base64url");
const now=Math.floor(Date.now()/1000);
const base={type:"app",iss:teamDomain,aud:[expectedAudience],iat:now-10,nbf:now-10,exp:now+3600,sub:"test-parent"};
async function jwt(payload=base,header={alg:"RS256",typ:"JWT",kid:"test-rsa-kid"},alterSignature=false){
 const signed=b64(header)+"."+b64(payload);
 const sig=Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(signed)));
 if(alterSignature)sig[0]^=0xff;
 return signed+"."+sig.toString("base64url");
}
const request=token=>new Request("https://brick.example/parent/api/devices",{headers:token===null?{}:{"Cf-Access-Jwt-Assertion":token}});
const check=async(label,token,environment=env)=>{
 const value=await auth.verifyAccessRequest(request(token),environment);
 assert.equal(value,null,label+" should be denied");
};
try{
 const valid=await jwt();
 const result=await auth.verifyAccessRequest(request(valid),env);
 assert.equal(result?.sub,"test-parent","valid RSA-signed team JWT must authenticate");
 assert.equal(await auth.parentAuthorized(request(valid),env),true);
 await check("no JWT",null);
 await check("wrong audience",await jwt({...base,aud:["another-app"]}));
 await check("wrong issuer",await jwt({...base,iss:"https://evil.cloudflareaccess.com"}));
 await check("expired > clock skew",await jwt({...base,exp:now-120}));
 await check("future not-before",await jwt({...base,nbf:now+120}));
 await check("future issued-at",await jwt({...base,iat:now+120}));
 await check("overlong lifetime",await jwt({...base,exp:now+50*3600}));
 await check("tampered RSA signature",await jwt(base,undefined,true));
 await check("algorithm none",await jwt(base,{alg:"none",kid:"test-rsa-kid"}));
 await check("unknown key ID",await jwt(base,{alg:"RS256",kid:"unknown-kid"}));
 await check("invalid token header",valid.replace(/^[^.]+/,"not-base64"));
 await check("wrong production team config",valid,{...env,CF_ACCESS_TEAM_DOMAIN:"https://other.cloudflareaccess.com"});
 await check("missing Access audience",valid,{...env,CF_ACCESS_AUD:""});
 // Production must not accept forged internal development marker without a verified Access JWT.
 const forged=new Request("https://brick.example/parent/api/devices",{headers:{"X-Brick-Dev-Parent-Verified":"session-v1"}});
 assert.equal(await auth.parentAuthorized(forged,{...env,DEV_PARENT_AUTH_MODE:"d1-session-v1"}),false);
 assert(jwksRequests>=1,"real JWKS-verification branch must be exercised");
 console.log("PASS 8D.11 production Access RS256 JWT: valid team key, audience, issuer, times, alg, signature, wrong/missing credentials, dev marker rejected.");
}finally{globalThis.fetch=originalFetch;}
