// Strict source-independent Cloudflare Access challenge classification.
// Never use raw redirect status alone as proof of Access. 401/403 may come
// from the application itself and are useful denials but not Access proof.
export function cloudflareAccessChallenge(response,origin){
 const status=response?.status;
 if(![302,303,307].includes(status))return false;
 const location=response.headers?.get?.("location");
 if(typeof location!=="string"||!location)return false;
 let url;
 try{url=new URL(location,origin);}
 catch{return false;}
 if(url.protocol!=="https:")return false;
 const expected=new URL(origin);
 const direct=url.hostname===expected.hostname&&url.pathname.startsWith("/cdn-cgi/access/");
 const service=/^[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(url.hostname)&&url.pathname.startsWith("/cdn-cgi/access/");
 return direct||service;
}
export function requireAccessChallenge(response,label,origin){
 if(!cloudflareAccessChallenge(response,origin))
  throw new Error(label+": production must redirect to a verified Cloudflare Access login, not arbitrary local login or status "+(response?.status??"?"));
}
export function requireProtectedDenial(response,label,origin){
 if(response?.status===401||response?.status===403||cloudflareAccessChallenge(response,origin))return;
 throw new Error(label+": anonymous request was not denied (HTTP "+(response?.status??"?")+")");
}
export function requireNoPublicLocalLogin(response,label,origin){
 if(response?.status===200)throw new Error(label+": public production local login page detected");
 requireProtectedDenial(response,label,origin);
}
