export type OneMapEnv = {
  DB: D1Database;
  ONEMAP_EMAIL?: string;
  ONEMAP_PASSWORD?: string;
};

type TokenCache = { token: string; expiresAtMs: number };
type ReverseAddress = {
  block?: string;
  building?: string;
  street?: string;
  estate?: string;
  neighbourhood?: string;
  planningArea?: string;
  postal?: string;
};
type ReverseValue = { label: string; address: ReverseAddress };
let tokenCache: TokenCache | null = null;
const AUTH_URL = "https://www.onemap.gov.sg/api/auth/post/getToken";
const REVERSE_URL = "https://www.onemap.gov.sg/api/public/revgeocode";
const RATE_PER_MINUTE = 240; // deliberately below the V1 contract ceiling
const CACHE_TTL_MS = 30 * 86_400_000;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function cacheKey(lat:number,lon:number){return `rev:${lat.toFixed(5)},${lon.toFixed(5)}`}
function safeString(v: unknown){return typeof v === "string" ? v.trim() : ""}
function useful(v: unknown){const s=safeString(v);return s&&!/^NIL$/i.test(s)&&!/^null$/i.test(s)?s:""}
function firstUseful(g:Record<string,unknown>,keys:string[]){for(const key of keys){const value=useful(g[key]);if(value)return value}return ""}
function cleanAddress(value: ReverseAddress): ReverseAddress {
  return Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v==="string"&&v.trim())) as ReverseAddress;
}

async function acquireRate(env:OneMapEnv):Promise<boolean>{
  const now=Date.now(),windowStart=Math.floor(now/60_000)*60_000;
  const row=await env.DB.prepare(`INSERT INTO provider_rate_window(provider,window_start,request_count,updated_at)
    VALUES('onemap',?1,1,?2) ON CONFLICT(provider) DO UPDATE SET
    window_start=CASE WHEN provider_rate_window.window_start=?1 THEN provider_rate_window.window_start ELSE ?1 END,
    request_count=CASE WHEN provider_rate_window.window_start=?1 THEN provider_rate_window.request_count+1 ELSE 1 END,
    updated_at=?2 RETURNING request_count`).bind(windowStart,now).first<{request_count:number}>();
  return Number(row?.request_count??RATE_PER_MINUTE+1)<=RATE_PER_MINUTE;
}

async function cachedValue(env:OneMapEnv,key:string):Promise<ReverseValue|null>{
  const row=await env.DB.prepare("SELECT value_json,expires_at FROM provider_cache WHERE provider='onemap-reverse' AND cache_key=?1").bind(key).first<{value_json:string;expires_at:number}>();
  if(!row||row.expires_at<=Date.now())return null;
  try{
    const x=JSON.parse(row.value_json) as {label?:unknown;address?:unknown};
    const label=typeof x.label==="string"&&x.label.trim()?x.label.trim():"";
    if(!label)return null;
    const address=x.address&&typeof x.address==="object"&&!Array.isArray(x.address)?cleanAddress(x.address as ReverseAddress):{};
    return {label,address};
  }catch{return null}
}
async function saveValue(env:OneMapEnv,key:string,value:ReverseValue){
  const now=Date.now();await env.DB.prepare(`INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at)
    VALUES('onemap-reverse',?1,?2,?3,?4) ON CONFLICT(provider,cache_key) DO UPDATE SET
    value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
    .bind(key,JSON.stringify(value),now+CACHE_TTL_MS,now).run();
}

async function token(env:OneMapEnv,force=false):Promise<string|null>{
  const now=Date.now();if(!force&&tokenCache&&tokenCache.expiresAtMs>now+5*60_000)return tokenCache.token;
  const email=env.ONEMAP_EMAIL?.trim(),password=env.ONEMAP_PASSWORD;
  if(!email||!password)return null;
  if(!(await acquireRate(env)))return null;
  const response=await fetch(AUTH_URL,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({email,password})});
  if(!response.ok)return null;
  const body=await response.json<Record<string,unknown>>();const access=safeString(body.access_token);if(!access)return null;
  const raw=Number(body.expiry_timestamp);const expiresAtMs=Number.isFinite(raw)&&raw>0?(raw<10_000_000_000?raw*1000:raw):now+3*86_400_000;
  tokenCache={token:access,expiresAtMs};return access;
}

function reverseValueFrom(body:unknown):ReverseValue|null{
  if(!body||typeof body!=="object"||Array.isArray(body))return null;
  const list=(body as Record<string,unknown>).GeocodeInfo;if(!Array.isArray(list)||!list.length)return null;
  const first=list[0];if(!first||typeof first!=="object"||Array.isArray(first))return null;
  const g=first as Record<string,unknown>;

  // Preserve useful authoritative fields when OneMap actually returns them. Never synthesize a
  // block/building/estate/planning-area/postal value from coordinates or unrelated fields.
  const block=firstUseful(g,["BLOCK","BLK_NO"]);
  const street=firstUseful(g,["ROAD","ROAD_NAME"]);
  const building=firstUseful(g,["BUILDINGNAME","BUILDING"]);
  const postal=firstUseful(g,["POSTALCODE","POSTAL"]);
  const estate=firstUseful(g,["ESTATE"]);
  const neighbourhood=firstUseful(g,["NEIGHBOURHOOD","NEIGHBORHOOD"]);
  const planningArea=firstUseful(g,["PLANNINGAREA","PLANNING_AREA","PLANNINGAREA_NAME"]);
  const address=cleanAddress({block,building,street,estate,neighbourhood,planningArea,postal});

  const streetLine=[block,street].filter(Boolean).join(" ");
  const locality=[neighbourhood,estate,planningArea].filter((v,i,a)=>v&&a.indexOf(v)===i).join(" · ");
  const parts=[building,streetLine,locality,postal].filter(Boolean);
  if(!parts.length)return null;
  return {label:parts.join(" · "),address};
}

async function callReverse(env:OneMapEnv,lat:number,lon:number,access:string){
  if(!(await acquireRate(env)))return {status:429,value:null as ReverseValue|null};
  const u=new URL(REVERSE_URL);u.searchParams.set("location",`${lat},${lon}`);u.searchParams.set("buffer","40");u.searchParams.set("addressType","All");u.searchParams.set("otherFeatures","N");
  const response=await fetch(u.toString(),{headers:{Authorization:access,Accept:"application/json"}});
  if(!response.ok)return {status:response.status,value:null};
  return {status:response.status,value:reverseValueFrom(await response.json())};
}

export async function reverseOneMap(env:OneMapEnv,lat:number,lon:number){
  if(!Number.isFinite(lat)||lat<1.0||lat>1.6||!Number.isFinite(lon)||lon<103.5||lon>104.2)return {label:null,address:{},source:"outside_singapore",cached:false};
  const key=cacheKey(lat,lon),cached=await cachedValue(env,key);if(cached)return {...cached,source:"onemap_cache",cached:true};
  let access=await token(env);if(!access)return {label:null,address:{},source:"onemap_unavailable",cached:false};
  let result=await callReverse(env,lat,lon,access);
  if(result.status===401||result.status===403){tokenCache=null;access=await token(env,true);if(access)result=await callReverse(env,lat,lon,access)}
  if(result.value){await saveValue(env,key,result.value);return {...result.value,source:"onemap",cached:false}}
  return {label:null,address:{},source:result.status===429?"onemap_rate_limited":"onemap_unavailable",cached:false};
}

export async function parentReverseOneMap(req:Request,env:OneMapEnv){
  const u=new URL(req.url),rawLat=u.searchParams.get("lat"),rawLon=u.searchParams.get("lon");const requestId=(u.searchParams.get("requestId")??"").slice(0,120);
  // Number(null) and Number("") are both zero; absent/blank parameters are not real coordinates.
  if(rawLat===null||rawLon===null||!rawLat.trim()||!rawLon.trim())return json({error:"invalid coordinates",requestId},400);
  const lat=Number(rawLat),lon=Number(rawLon);
  if(!Number.isFinite(lat)||lat< -90||lat>90||!Number.isFinite(lon)||lon< -180||lon>180)return json({error:"invalid coordinates",requestId},400);
  const result=await reverseOneMap(env,lat,lon);return json({...result,requestId});
}
