import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync('src/parent-beta.ts','utf8');
const start=code.indexOf('function p2BuildHistoryGeometry(points){');
const end=code.indexOf('let p2HistoryRouteStats=',start);
assert(start>0&&end>start,'segmented route geometry helper must exist');
const vmContext=vm.createContext({historyCoord:p=>p?.trustedLatE7==null||p?.trustedLonE7==null?null:[p.trustedLonE7/1e7,p.trustedLatE7/1e7],Math,Number,Array});
vm.runInContext(code.slice(start,end),vmContext,{timeout:1000});
const build=vmContext.p2BuildHistoryGeometry;
const point=(time,lat,lon)=>({wallTimeMs:time,trustedLatE7:lat==null?null:Math.round(lat*1e7),trustedLonE7:lon==null?null:Math.round(lon*1e7)});
const a=build([
 point(1000,1.3,103.8),point(2000,1.3001,103.8001),
 point(3000,null,null), // no trusted location: do not connect!
 point(4000,1.31,103.81),point(5000,1.3101,103.8101),
 point(401000,1.33,103.83),point(402000,1.3301,103.8301), // 396s missing period: do not connect!
 point(403000,99,103.84), // invalid coordinate: must not draw
 point(404000,1.34,103.84),point(405000,1.3401,103.8401)
]);
assert.equal(a.data.geometry.type,'MultiLineString');
assert.equal(a.segments,4,'four independent observed segments');
assert.equal(a.gaps,3,'missing fix, long interval and invalid coordinate must break route');
assert.equal(a.data.geometry.coordinates.length,4);
assert(a.data.geometry.coordinates.every(line=>line.length===2),'no false connecting line');
assert.equal(a.all.length,8,'never include invalid or unknown coordinates');
assert.equal(a.data.geometry.coordinates[0][0][0],103.8);
assert.equal(a.data.geometry.coordinates[1][0][0],103.81);
assert.equal(a.data.geometry.coordinates[2][0][0],103.83);
assert.equal(a.data.geometry.coordinates[3][0][0],103.84);
const b=build([point(1,1.2,103.8),point(2,null,null),point(3,1.3,103.9)]);
assert.equal(b.segments,0,'isolated points cannot become fabricated route');
assert.equal(b.gaps,1);
assert.equal(build([]).all.length,0);
const c=build([point(5000,1.1,103.8),point(4999,1.2,103.9),point(5001,1.3,103.81)]);
assert.equal(c.gaps,1,'out-of-order timestamps must not be connected');
assert.equal(c.segments,1);
assert(code.includes('drawHistory(historyPoints);'),'render must use raw points with missing-fix evidence, not pre-simplified points');
console.log('PASS Phase2 History geometry: missing fixes, long recording gaps, invalid coordinates, timestamp inversions, raw evidence');
