export type CommutePoint={wallTimeMs:number;trustedLatE7:number|null;trustedLonE7:number|null;uncertaintyCm:number;activity:number;activityConfidence?:number;speedCms:number|null;rawAccepted:boolean;fallback:boolean};
export function commuteDistance(a:CommutePoint,b:CommutePoint){
 if(a.trustedLatE7==null||a.trustedLonE7==null||b.trustedLatE7==null||b.trustedLonE7==null)return 0;
 const rad=(v:number)=>v*Math.PI/180,aLat=a.trustedLatE7/1e7,aLon=a.trustedLonE7/1e7,bLat=b.trustedLatE7/1e7,bLon=b.trustedLonE7/1e7,R=6371000;
 const dLat=rad(bLat-aLat),dLon=rad(bLon-aLon),x=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLon/2)**2;
 return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
export function commuteMode(activity:number){return activity===2?"walking":activity===3?"running":activity===4?"bicycle":activity===5?"vehicle":"unknown";}
export function commuteMoving(p:CommutePoint){return p.activity!==1&&(p.speedCms==null||p.speedCms>=80);}
export async function commuteId(text:string){const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));return "comm_"+Array.from(digest.slice(0,16),b=>b.toString(16).padStart(2,"0")).join("");}
