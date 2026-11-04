import assert from "node:assert/strict";
import { createHash, randomBytes, webcrypto } from "node:crypto";
import { pathToFileURL } from "node:url";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const [moduleFile] = process.argv.slice(2);
if (!moduleFile) throw Error("usage: test-phase8d-development-login.mjs <bundled module>");
const auth = await import(pathToFileURL(moduleFile).href);
const access = randomBytes(32).toString("base64url"), hash = createHash("sha256").update(access).digest("hex");
assert(access.length >= 43);
const origin = "https://brick-dev.example.test";
const sessions = new Map();
const env = {
  DEV_PARENT_LOGIN_HASH: hash,
  PARENT_LOGIN_RATE: { async limit() { return { success: true }; } },
  DB: { prepare(sql) {return {bind(...params) {return {
    async first() {if (!sql.includes("SELECT 1 AS ok")) throw Error("unexpected SELECT"); const s=sessions.get(params[0]);return s && !s.revoked_at && s.expires_at >= params[1]?{ok:1}:null;},
    async run() {
      if (sql.startsWith("INSERT INTO dev_parent_sessions"))sessions.set(params[0],{expires_at:params[2],revoked_at:null});
      else if (sql.startsWith("UPDATE dev_parent_sessions")){const s=sessions.get(params[1]);if(s)s.revoked_at=params[0];}
      else throw Error("unexpected mutation");
    }
  };}};}}
};
function post(token, requestOrigin=origin) {
  return new Request(origin+"/parent/login", {method:"POST",headers:{"Origin":requestOrigin,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token}).toString()});
}
const page = await auth.handleDevParentAuthRoute(new Request(origin+"/parent/login"),env);
assert.equal(page.status,200);
assert(!((await page.text()).includes("6-digit")),"weak PIN instructions must be gone");
assert.equal((await auth.handleDevParentAuthRoute(post(access,"https://evil.example.test"),env)).status,403,"must reject cross-origin POST");
assert.equal((await auth.handleDevParentAuthRoute(post("123456"),env)).status,400,"must reject legacy six-digit PIN");
assert.equal((await auth.handleDevParentAuthRoute(post(randomBytes(32).toString("base64url")),env)).status,401,"wrong token must fail");
assert.equal((await auth.handleDevParentAuthRoute(post(access),{...env,DEV_PARENT_LOGIN_HASH:undefined})).status,401,"missing secret must fail closed");
const ok=await auth.handleDevParentAuthRoute(post(access),env);
assert.equal(ok.status,303,"valid secret should create session");
const cookie=ok.headers.get("set-cookie");
assert(cookie?.includes("HttpOnly")&&cookie.includes("Secure")&&cookie.includes("SameSite=Strict"),"session cookie hardening");
const sessionId=cookie.split(";")[0];
const authed=new Request(origin+"/parent/api/device/child-a/state",{headers:{Cookie:sessionId}});
assert(await auth.devParentSessionValid(authed,env),"created session should validate");
const forwarded=await auth.authorizeDevParentRequest(authed,env);
assert.equal(forwarded.headers.get(auth.DEV_PARENT_INTERNAL_HEADER),auth.DEV_PARENT_INTERNAL_VALUE);
const forged=auth.stripDevParentInternalHeader(new Request(origin+"/parent", {headers:{[auth.DEV_PARENT_INTERNAL_HEADER]:auth.DEV_PARENT_INTERNAL_VALUE}}));
assert.equal(forged.headers.get(auth.DEV_PARENT_INTERNAL_HEADER),null,"forged internal marker must be stripped");
const logout=await auth.handleDevParentAuthRoute(new Request(origin+"/parent/logout",{method:"POST",headers:{Origin:origin,Cookie:sessionId}}),env);
assert.equal(logout.status,303);
assert.equal(await auth.devParentSessionValid(authed,env),false,"logout must revoke session");
assert.equal((await auth.handleDevParentAuthRoute(post(access),{...env,PARENT_LOGIN_RATE:{async limit(){return {success:false};}}})).status,429,"rate limited");
console.log("P8D-003 PASS: six-digit PIN rejected, private high-entropy token accepted, missing secret fail-closed, Origin/rate/session/cookie/forged-header/logout verified.");
