import assert from 'node:assert/strict';

const { createParentSession, parentSessionValid, handleParentLogin, PARENT_COOKIE } = await import(process.argv[2]);

const secret='correct horse battery staple 2026';
const now=1_800_000_000_000;
const token=await createParentSession(secret,now);
const req=new Request('https://brick.example/parent',{headers:{Cookie:`${PARENT_COOKIE}=${token}`}});
assert.equal(await parentSessionValid(req,secret,now+60_000),true,'fresh session should validate');
assert.equal(await parentSessionValid(req,'wrong secret for testing',now+60_000),false,'wrong secret must fail');
assert.equal(await parentSessionValid(req,secret,now+24*60*60*1000+1),false,'expired session must fail');

const env={BRICK_PARENT_PASSWORD:secret,PAIR_RATE:{limit:async()=>({success:true})}};
const goodBody=new URLSearchParams({password:secret});
const good=await handleParentLogin(new Request('https://brick.example/parent/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:goodBody}),env);
assert.equal(good.status,303,'correct password should redirect');
assert.match(good.headers.get('set-cookie')||'',/HttpOnly/,'session cookie must be HttpOnly');
assert.match(good.headers.get('set-cookie')||'',/Secure/,'session cookie must be Secure');
assert.match(good.headers.get('set-cookie')||'',/SameSite=Strict/,'session cookie must be SameSite Strict');

const badBody=new URLSearchParams({password:'definitely-not-correct'});
const bad=await handleParentLogin(new Request('https://brick.example/parent/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:badBody}),env);
assert.equal(bad.status,401,'wrong password must fail');
assert.equal(bad.headers.get('set-cookie'),null,'wrong password must not create a session');

const limitedEnv={BRICK_PARENT_PASSWORD:secret,PAIR_RATE:{limit:async()=>({success:false})}};
const limited=await handleParentLogin(new Request('https://brick.example/parent/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:secret})}),limitedEnv);
assert.equal(limited.status,429,'rate limit must be enforced');

console.log('Brick parent authentication tests passed');
