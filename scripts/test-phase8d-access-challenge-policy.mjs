import assert from "node:assert/strict";
import {cloudflareAccessChallenge,requireAccessChallenge,requireProtectedDenial,requireNoPublicLocalLogin} from "./phase8d-access-denial-policy.mjs";
const origin="https://brick-family-v1.example.workers.dev";
const redirect=(url,status=303)=>new Response(null,{status,headers:{Location:url}});
const pass=[
 redirect("/cdn-cgi/access/login?token=synthetic"),
 redirect("https://team.cloudflareaccess.com/cdn-cgi/access/login?redirect_url=synthetic",302),
 redirect("https://team.cloudflareaccess.com/cdn-cgi/access/login?redirect_url=synthetic",307)
];
for(const r of pass){assert.equal(cloudflareAccessChallenge(r,origin),true);requireAccessChallenge(r,"live",origin);requireNoPublicLocalLogin(r,"login",origin);}
for(const r of [
 redirect("/parent/login"),
 redirect("/parent/login?source=dev"),
 redirect("https://brick-family-v1.example.workers.dev/parent/login"),
 redirect("https://team.cloudflareaccess.com.evil.invalid/cdn-cgi/access/login"),
 redirect("https://untrusted.invalid/cdn-cgi/access/login"),
 redirect("//evil.invalid/cdn-cgi/access/login"),
 redirect("http://team.cloudflareaccess.com/cdn-cgi/access/login"),
 redirect("/parent"),
 redirect("",303),
 new Response(null,{status:200}),
 new Response(null,{status:401}),
 new Response(null,{status:403}),
 new Response(null,{status:404})
]){
 assert.equal(cloudflareAccessChallenge(r,origin),false);
 assert.throws(()=>requireAccessChallenge(r,"unverified",origin),"non-Access denial accepted as Access login");
}
for(const status of [401,403])requireProtectedDenial(new Response(null,{status}),"api",origin);
assert.throws(()=>requireNoPublicLocalLogin(new Response("login form",{status:200}),"prod login",origin));
assert.throws(()=>requireProtectedDenial(redirect("/parent/login"),"redirect",origin));
assert.throws(()=>requireProtectedDenial(new Response(null,{status:404}),"unknown",origin));
console.log("PASS P8D-047: strict Cloudflare Access challenge rejects arbitrary 303 local login, lookalike domain, HTTP downgrade and exposed production login; 401/403 alone never certify Access");
