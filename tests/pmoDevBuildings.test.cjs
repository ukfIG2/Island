const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {compilePmoBrushCorridors}=require('../dist/render/spatialMeta/pmoBrushCorridors');
const {generatePmoDevBuildings,seedFromUrl,seededRandom,TEST_BUILDING_NAMES}=require('../dist/dev/pmoDevBuildings');
const flat={project:p=>[p[0],0,p[2]],verify:(a,b)=>Math.abs(a[1]-b[1])<0.0001};
const stamps=[{center:[-2,0,0],radius:2.4,sourceId:'paint:left'},{center:[1,0,0],radius:2.4,sourceId:'paint:right'}];
const graph=compilePmoBrushCorridors(stamps,flat,[],{step:0.18,maxWalkLink:0.28});
const make=seed=>generatePmoDevBuildings(graph,flat,seed,{minBuildingSpacing:0.65});

test('seed is reproducible and generates five debug sites',()=>{
 const a=make(4622),b=make(4622);assert.deepEqual(a,b);assert.equal(a.buildings.length,5);
 assert.deepEqual(a.buildings.map(x=>x.name),TEST_BUILDING_NAMES);
});
test('different reload seeds change randomized sites',()=>{
 const a=make(1111),b=make(2222);
 assert.notDeepEqual(a.buildings.map(x=>x.position),b.buildings.map(x=>x.position));
});
test('all sites project onto real declared walk paint and have mutual clearance',()=>{
 const {buildings}=make(89423);
 for(const b of buildings){assert.equal(b.position[1],0);assert.ok(stamps.some(s=>Math.hypot(b.position[0]-s.center[0],b.position[2]-s.center[2])<=s.radius+1e-6));}
 for(let i=0;i<buildings.length;i++)for(let j=i+1;j<buildings.length;j++)assert.ok(Math.hypot(buildings[i].position[0]-buildings[j].position[0],buildings[i].position[2]-buildings[j].position[2])>=0.65-1e-6);
});
test('valid flat terrain produces certified beach to building routes',()=>{
 const a=make(31337); assert.equal(a.stats.reachableBuildings,5);
 assert.equal(a.stats.unreachableBuildings,0);
 for(const b of a.buildings){assert.equal(b.routeStatus,'READY');assert.ok(b.routePoints.length>=2);}
});
test('small paint cannot silently invent missing placements',()=>{
 const one=compilePmoBrushCorridors([{center:[0,0,0],radius:0.2,sourceId:'tiny'}],flat,[],{step:0.14,maxWalkLink:0.21});
 const scenario=generatePmoDevBuildings(one,flat,13,{minBuildingSpacing:1});
 assert.ok(scenario.buildings.length<=1);assert.ok(scenario.failures.length>=4);
});
test('query seed supports exact replay, and no query means new RNG source',()=>{
 assert.equal(seedFromUrl('?seed=123',()=>2),123);
 assert.equal(seedFromUrl('',()=>312398),312398);
 assert.throws(()=>seedFromUrl('?seed=4294967296',()=>0),/BAD_QUERY/);
 assert.throws(()=>seededRandom(-1),/BAD_SEED/);
});
test('unverified terrain cannot create building placements',()=>{
 const bad={project:p=>[p[0],0,p[2]],verify:()=>false};
 const pathGraph=compilePmoBrushCorridors(stamps,bad,[],{step:0.18,maxWalkLink:0.28});
 const scenario=generatePmoDevBuildings(pathGraph,bad,42);
 assert.equal(scenario.buildings.length,0);assert.equal(scenario.failures.length,5);
});
test('debug page does not write canonical state, modify terrain or issue Core rewards',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../src/dev/pmo-lab.ts'),'utf8');
 const home=fs.readFileSync(path.join(__dirname,'../src/dev/pmo-lab.html'),'utf8');
 assert.match(home,/pmo-lab.ts/);
 assert.match(main,/makeTerrainProjector/);
 assert.match(main,/readPmoWalkAuthorization/);
 assert.match(main,/PmoPedestrianRuntime/);
 assert.doesNotMatch(main,/BootstrapCore|\.dispatch\(|\.save\(|geometry\.attributes\.position\.setXYZ/);
 assert.match(main,/import\.meta\.env\.DEV/);
});
