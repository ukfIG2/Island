const test = require('node:test');
const assert = require('node:assert/strict');
const {compilePmoBrushCorridors,planBrushCorridorRoute,chooseCertifiedBrushSpawn,HelperQueue} = require('../dist/render/spatialMeta/pmoBrushCorridors.js');

const planar = (height = () => 0) => ({
  project: p => [p[0],height(p[0],p[2]),p[2]],
  verify: (a,b) => {
    const dx = Math.hypot(a[0]-b[0],a[2]-b[2]), dy = Math.abs(b[1]-a[1]);
    return dx <= 0.215 + 1e-8 && dy <= 0.20 + 1e-8 && (dx === 0 ? dy === 0 : dy/dx <= 0.72 + 1e-8);
  },
});
const stamp = (x,y,z,radius,id='paint') => ({ center: [x,y,z], radius, sourceId:id });

test('same connected paint has real terrain-certified outward and return routes', () => {
  const connector=planar(), stamps=[stamp(0,0,0,0.46,'beach'),stamp(0.47,0,0,0.48,'upper')];
  const graph=compilePmoBrushCorridors(stamps,connector);
  assert(graph.nodes.length>8);
  const a=planBrushCorridorRoute(graph,connector,[0,0,0],[0.65,0,0]);
  const b=planBrushCorridorRoute(graph,connector,[0.65,0,0],[0,0,0]);
  assert.equal(a.status,'READY');assert.equal(b.status,'READY');
  assert(a.steps.every(s=>s.kind==='walk'));assert(a.brushSourceIds.includes('beach'));assert(a.brushSourceIds.includes('upper'));
});

test('XZ brush overlap cannot forge crossing over grade discontinuity', () => {
  const connector=planar(x=>x>=0.5?0.18:0), stamps=[stamp(0.23,0,0,0.37,'a'),stamp(0.76,0.18,0,0.39,'b')];
  const graph=compilePmoBrushCorridors(stamps,connector);
  const route=planBrushCorridorRoute(graph,connector,[0.16,0,0],[0.79,0.18,0]);
  assert.equal(route.status,'UNREACHABLE');
});

test('helper transition cannot be inferred from metadata without trusted certification', () => {
  const connector=planar(x=>x>=0.5?0.18:0), stamps=[stamp(0.23,0,0,0.37,'a'),stamp(0.76,0.18,0,0.39,'b')];
  const helper={id:'stairs-1',kind:'stairs',sourceId:'known-stairs',edgeId:'known-edge',from:[0.28,0,0],to:[0.72,0.18,0],capacity:1};
  const graph=compilePmoBrushCorridors(stamps,connector,[helper]);
  assert.equal(graph.rejectedHelpers[0].reason,'UNTRUSTED_OR_UNCERTIFIED_HELPER');
  assert.equal(planBrushCorridorRoute(graph,connector,[0.16,0,0],[0.79,0.18,0]).status,'UNREACHABLE');
});

test('trusted certified helper route carries explicit helper edge and does not bypass walking check', () => {
  const connector=planar(x=>x>=0.5?0.18:0), stamps=[stamp(0.23,0,0,0.37,'a'),stamp(0.76,0.18,0,0.39,'b')];
  const helper={id:'stairs-1',kind:'stairs',sourceId:'known-stairs',edgeId:'known-edge',from:[0.28,0,0],to:[0.72,0.18,0],capacity:1};
  const graph=compilePmoBrushCorridors(stamps,connector,[helper],{authorizeHelper:h=>h.id==='stairs-1' && h.sourceId==='known-stairs'});
  assert.equal(graph.rejectedHelpers.length,0);
  const route=planBrushCorridorRoute(graph,connector,[0.16,0,0],[0.79,0.18,0]);
  assert.equal(route.status,'READY');
  assert(route.steps.some(s=>s.kind==='stairs' && s.helperId==='stairs-1'));
  assert.equal(route.steps.filter(s=>s.kind==='stairs').length,1);
});

test('fixed helper ports must still attach to authorized PMO zones', () => {
  const connector=planar(), stamps=[stamp(0,0,0,0.4),stamp(1,0,0,0.4)];
  const helper={id:'teleport-fake',kind:'lift',sourceId:'fake',edgeId:'edge',from:[100,0,0],to:[1,0,0],capacity:1};
  const graph=compilePmoBrushCorridors(stamps,connector,[helper],{authorizeHelper:()=>true});
  assert.equal(graph.rejectedHelpers[0].reason,'HELPER_PORT_UNATTACHED');
});

test('missing or wrong destination paint blocks path', () => {
  const connector=planar(), graph=compilePmoBrushCorridors([stamp(0,0,0,0.3)],connector);
  assert.equal(planBrushCorridorRoute(graph,connector,[0,0,0],[4,0,0]).status,'UNAUTHORIZED_ENDPOINT');
});

test('spawn position remains in permitted stamp and is projected on the real terrain', () => {
  const conn=planar((x,z)=>0.1*x), stamps=[stamp(0,0,0,0.4,'beach')];
  const graph=compilePmoBrushCorridors(stamps,conn);
  for (let i=1;i<=30;i++) {
    const p=chooseCertifiedBrushSpawn(graph,conn,{sourceId:'beach',seed:i});
    assert(p);assert(Math.hypot(p[0],p[2])<=0.4000001);assert(Math.abs(p[1]-p[0]*0.1)<1e-8);
  }
});

test('spawn spacing excludes occupied positions without inventing a new legal position', () => {
  const connector=planar(), graph=compilePmoBrushCorridors([stamp(0,0,0,0.3)],connector);
  const p=chooseCertifiedBrushSpawn(graph,connector,{seed:23,occupied:[[0,0,0]],separation:10,attempts:12});
  assert.equal(p,null);
});

test('helper queue is FIFO and capacity limited, movement remains out of scope', () => {
  const h={id:'bridge',kind:'bridge',sourceId:'bridge-pmo',edgeId:'edge',from:[0,0,0],to:[1,0,0],capacity:1};
  const q=new HelperQueue({bridge:h});
  assert.equal(q.enter('bridge','guest-a'),true);
  assert.equal(q.enter('bridge','guest-b'),false);
  assert.equal(q.enter('bridge','guest-c'),false);
  assert.equal(q.enter('bridge','guest-a'),true);
  q.leave('bridge','guest-a');
  assert.equal(q.enter('bridge','guest-c'),false);
  assert.equal(q.enter('bridge','guest-b'),true);
  q.leave('bridge','guest-b');
  assert.equal(q.enter('bridge','guest-c'),true);
  assert.deepEqual(q.status('bridge'),{active:['guest-c'],pending:[]});
});

test('strict grade/step rule cannot be silently relaxed', () => {
  const connector=planar();assert.throws(()=>compilePmoBrushCorridors([stamp(0,0,0,0.2)],connector,[],{maxGrade:2}),/PMO_NAVIGATION_RULES_UNSAFE/);
  assert.throws(()=>compilePmoBrushCorridors([stamp(0,0,0,0.2)],connector,[],{maxStepY:0.21}),/PMO_NAVIGATION_RULES_UNSAFE/);
});

const {PmoPedestrianRuntime} = require('../dist/render/spatialMeta/pmoPedestrianRuntime.js');

test('two pedestrians integrate independent position trajectories and really arrive', () => {
  const conn=planar(), graph=compilePmoBrushCorridors([stamp(0,0,0,0.6),stamp(0.47,0,0,0.6)],conn);
  const runtime=new PmoPedestrianRuntime(graph,conn,{collisionSpacing:0.10});
  assert.equal(runtime.add({id:'g1',from:[0,0,-0.12],to:[0.8,0,-0.12],speed:0.4}).status,'READY');
  assert.equal(runtime.add({id:'g2',from:[0,0,0.12],to:[0.8,0,0.12],speed:0.3}).status,'READY');
  const initial=runtime.snapshots().map(x=>x.position);
  for (let i=0;i<500;i++)runtime.tick(0.1);
  const result=runtime.snapshots();
  assert.deepEqual(result.map(x=>x.status),['arrived','arrived']);
  assert(result[0].position[0]>0.75);assert(result[1].position[0]>0.75);
  assert.notDeepEqual(initial[0],result[0].position);
});

test('special crossing cannot move actor without physical sampled geometry', () => {
  const conn=planar(x=>x>=0.5?0.18:0),stamps=[stamp(0.23,0,0,0.37),stamp(0.76,0.18,0,0.39)];
  const helper={id:'stairs',sourceId:'source',edgeId:'edge',kind:'stairs',from:[0.28,0,0],to:[0.72,0.18,0],capacity:1};
  const graph=compilePmoBrushCorridors(stamps,conn,[helper],{authorizeHelper:()=>true});
  const runtime=new PmoPedestrianRuntime(graph,conn);
  assert.equal(runtime.add({id:'g',from:[0.16,0,0],to:[0.79,0.18,0]}).status,'READY');
  for(let i=0;i<160;i++)runtime.tick(0.1);
  const s=runtime.snapshots()[0];
  assert.equal(s.status,'waiting-helper');
  assert(s.position[0] < 0.5);
});

test('helper must follow physically sampled surface; cannot teleport to exit', () => {
  const conn=planar(x=>x>=0.5?0.18:0),stamps=[stamp(0.23,0,0,0.37),stamp(0.76,0.18,0,0.39)];
  const helper={id:'stairs',sourceId:'source',edgeId:'edge',kind:'stairs',from:[0.28,0,0],to:[0.72,0.18,0],capacity:1};
  const graph=compilePmoBrushCorridors(stamps,conn,[helper],{authorizeHelper:()=>true});
  const runtime=new PmoPedestrianRuntime(graph,conn,{samplePhysicalHelper:()=>[100,0,100]});
  assert.equal(runtime.add({id:'g',from:[0.16,0,0],to:[0.79,0.18,0]}).status,'READY');
  for(let i=0;i<160;i++){runtime.tick(0.1);if(runtime.snapshots()[0].status==='blocked')break}
  assert.equal(runtime.snapshots()[0].status,'blocked');
  assert.equal(runtime.snapshots()[0].fault,'HELPER_MOTION_NOT_CONTINUOUS');
});

test('24 independently routed pedestrians can exist on one PMO network', () => {
  const conn=planar(), marks=[-0.3,0.1,0.5,0.9,1.3,1.7,2.1].map(x=>stamp(x,0,0,0.54,'promenade'));
  const graph=compilePmoBrushCorridors(marks,conn);
  const runtime=new PmoPedestrianRuntime(graph,conn,{collisionSpacing:0.075});
  for(let i=0;i<24;i++){
    const from=[-0.23+(i%12)*0.205,0,i<12?-0.14:0.14];
    const to=[from[0]+0.24,0,from[2]];
    const result=runtime.add({id:'guest-'+i,from,to,speed:0.33});
    assert.equal(result.status,'READY','guest '+i+' '+JSON.stringify(result));
  }
  const initial=runtime.snapshots().map(x=>x.position);
  for(let n=0;n<200;n++)runtime.tick(0.05);
  const current=runtime.snapshots();
  assert.equal(current.length,24);
  assert(current.every(x=>x.status!=='blocked'),JSON.stringify(current.filter(x=>x.status==='blocked')));
  assert(current.filter((x,i)=>Math.hypot(x.position[0]-initial[i][0],x.position[2]-initial[i][2])>0.1).length>=20);
});
