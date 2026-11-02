import { parentV6CHtml } from "./parent-v6c";

function replaceOnce(input: string, needle: string, replacement: string, label: string) {
  if (!input.includes(needle)) throw new Error(`Phase 6D parent resilience patch target missing: ${label}`);
  return input.replace(needle, replacement);
}

export function parentV6DHtml() {
  let html = parentV6CHtml();

  const mapInit = "const $=s=>document.querySelector(s);const map=createBrickMap('map');let privateMapInstalled=false,localMapPlace='Private map loading',localMapResolveKey='';";
  const resilientMapInit = `const $=s=>document.querySelector(s);let map;try{map=createBrickMap('map')}catch{const el=$('#map');if(el){el.replaceChildren();el.style.background='#f3f5f7';el.style.display='grid';el.style.placeItems='center';const n=document.createElement('div');n.style.cssText='max-width:340px;padding:20px;text-align:center;color:#475467;font:13px/1.5 system-ui,sans-serif';n.textContent='Map unavailable on this browser. Brick controls and device data are still available.';el.appendChild(n)}map={__brickFallback:true,on:(event,cb)=>{if(event==='load')queueMicrotask(cb)},once:(event,cb)=>{if(event==='load')queueMicrotask(cb)},isStyleLoaded:()=>false,getSource:()=>null,addSource:()=>{},addLayer:()=>{},getLayer:()=>null,removeLayer:()=>{},removeSource:()=>{},easeTo:()=>{},fitBounds:()=>{},getCenter:()=>({lng:103.8198,lat:1.3521})}}let privateMapInstalled=false,localMapPlace='Private map loading',localMapResolveKey='';`;
  html = replaceOnce(html, mapInit, resilientMapInit, 'non-fatal map startup');

  html = replaceOnce(
    html,
    "function updateAccuracy(l){if(!map.isStyleLoaded()||!l||l.lat==null||l.lon==null)return;",
    "function updateAccuracy(l){if(map?.__brickFallback||!map.isStyleLoaded()||!l||l.lat==null||l.lon==null)return;",
    'accuracy fallback guard'
  );

  html = replaceOnce(
    html,
    "function animateMarker(target){if(!marker){",
    "function animateMarker(target){if(map?.__brickFallback)return;if(!marker){",
    'live marker fallback guard'
  );

  html = replaceOnce(
    html,
    "function drawHistory(points){const coords=",
    "function drawHistory(points){if(map?.__brickFallback)return;const coords=",
    'history map fallback guard'
  );

  html = replaceOnce(
    html,
    "if(c){if(!playMarker)playMarker=new maplibregl.Marker({scale:.7}).setLngLat(c).addTo(map);else playMarker.setLngLat(c);map.easeTo({center:c,duration:300})}",
    "if(c&&!map?.__brickFallback){if(!playMarker)playMarker=new maplibregl.Marker({scale:.7}).setLngLat(c).addTo(map);else playMarker.setLngLat(c);map.easeTo({center:c,duration:300})}",
    'history playback fallback guard'
  );

  html = replaceOnce(
    html,
    "function renderRouteCorridor(l){const id='brick-route-corridor'",
    "function renderRouteCorridor(l){if(map?.__brickFallback)return;const id='brick-route-corridor'",
    'route corridor fallback guard'
  );

  html = replaceOnce(
    html,
    "text('#mapPrivacy',privateMapInstalled?'Map · private OSM archive':'Map · private archive missing')",
    "text('#mapPrivacy',map?.__brickFallback?'Map · browser unavailable':privateMapInstalled?'Map · private OSM archive':'Map · private archive missing')",
    'map status fallback label'
  );

  html = html.replace(
    '<title>Brick Parent · Development Beta</title>',
    '<title>Brick Parent · Development Beta 5</title>'
  );

  return html;
}
