import assert from 'node:assert/strict';
import {pbkdf2Sync,randomBytes,webcrypto} from 'node:crypto';
import {pathToFileURL} from 'node:url';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const path=process.argv[2];
if(!path)throw Error('Usage: test-phase2-parent-passphrase.mjs <bundled module>');
const auth=await import(pathToFileURL(path).href);
const origin='https://brick-beta.invalid';
const password='ValidSecret_123'; // 15-character synthetic fixture
const salt=randomBytes(16);
const hash=pbkdf2Sync(password,salt,240000,32,'sha256');
const verifier='pbkdf2-sha256:240000:'+salt.toString('base64url')+':'+hash.toString('base64url');
const sessions=new Map();
const db={
  prepare(sql){return {
    async first(){if(sql.includes("SELECT verifier FROM dev_parent_credentials"))return null;throw Error("unexpected direct SELECT");},
    bind(...args){return {
      async first(){
        if(!sql.includes("SELECT 1 AS ok"))throw Error("unexpected SELECT");
        const x=sessions.get(args[0]);return x&&x.expires_at>args[1]&&!x.revoked_at?{ok:1}:null;
      },
      async run(){
        if(sql.startsWith("INSERT INTO dev_parent_sessions"))sessions.set(args[0],{expires_at:args[2],revoked_at:null});
        else if(sql.startsWith("UPDATE dev_parent_sessions")){const x=sessions.get(args[1]);if(x)x.revoked_at=args[0];}
        else throw Error("unexpected SQL");
      }
    };}
  };}
};
const env={DEV_PARENT_LOGIN_HASH:verifier,DB:db,PARENT_LOGIN_RATE:{async limit(){return{success:true}}}};
const post=(secret,site=origin)=>new Request(origin+'/parent/login',{method:'POST',headers:{Origin:site,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:secret}).toString()});
assert.equal((await auth.handleDevParentAuthRoute(post(password),env)).status,303,'correct private passphrase logs in');
assert.equal((await auth.handleDevParentAuthRoute(post('OtherTestPassword12345'),env)).status,401,'wrong passphrase rejected');
assert.equal((await auth.handleDevParentAuthRoute(post(password,'https://evil.invalid'),env)).status,403,'origin mismatch rejected');
assert.equal((await auth.handleDevParentAuthRoute(post(password),{...env,DEV_PARENT_LOGIN_HASH:'invalid'})).status,401,'invalid verifier fails closed');
const login=await auth.handleDevParentAuthRoute(post(password),env);
const cookie=login.headers.get('set-cookie');
assert(cookie?.includes('HttpOnly')&&cookie.includes('Secure')&&cookie.includes('SameSite=Strict'));
const session=cookie.split(';')[0];
assert(await auth.devParentSessionValid(new Request(origin+'/parent',{headers:{Cookie:session}}),env));
assert.equal((await auth.handleDevParentAuthRoute(post('ShortSecret123'),env)).status,400,'14-character secrets remain below the minimum');
assert.equal((await auth.handleDevParentAuthRoute(post('123456'),env)).status,400,'6-digit PIN stays unsupported');
console.log('PASS: Phase 2 salted PBKDF2 passphrase, bad-password denial, strict cookies and origin protection');
