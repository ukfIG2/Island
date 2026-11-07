import { describe, it, expect } from 'vitest';
import {
  compilePmoBrushCorridors, planBrushCorridorRoute, type BrushGraph, type PmoTerrainConnector, type SpatialPoint,
} from '../render/spatialMeta/pmoBrushCorridors';
import { PathfindingTestSession } from './pathfindingTestSession';
import { certifyWalkMotion } from './pmoWalkMotionAudit';

// A real terrain seam can invalidate the shortest coarse start attachment,
// while a longer, certified attachment reaches the same destination. Shuffle
// must agree with the physical runtime's route selection, not veto it.
const level=-2.2;
const point=(x:number,z:number):SpatialPoint=>[x,level,z];
const start=point(0.04,0);
const goal=point(0.04,0.3);
const positions=[point(0,0),point(0.04,-0.2),point(0,0.3),goal];
const walk=(to:number,cost:number)=>({to,cost,kind:'walk' as const});
const graph:BrushGraph={
  nodes:positions.map((position,id)=>({id,point:position,sources:['walk']})),
  neighbors:[
    [walk(2,0.3)],
    [walk(3,0.5)],
    [walk(0,0.3),walk(3,0.04)],
    [walk(1,0.5),walk(2,0.04)],
  ],
  stamps:[{center:point(0,0),radius:3,sourceId:'walk'}],
  helpers:{},rejectedHelpers:[],
  rules:{maxGrade:0.72,maxStepY:0.2,step:0.14,maxWalkLink:0.215,paintHeightTolerance:0.52},
};
const connector:PmoTerrainConnector={
  project:(candidate)=>
    candidate[2]>-0.035 && candidate[2]<0.035 &&
    candidate[0]>0.0001 && candidate[0]<0.0399
      ? null : [...candidate],
  // This reproduces a coarse connector which accepts an endpoint pair but
  // cannot actually certify every small displacement through a terrain seam.
  verify:()=>true,
};

describe('reshuffle route certification',()=>{
  it('chooses a longer, physically certified attachment instead of blocking an actor',()=>{
    const coarse=planBrushCorridorRoute(graph,connector,start,goal);
    expect(coarse.status).toBe('READY');
    if(coarse.status!=='READY')return;
    expect(coarse.steps.some(step=>step.kind==='walk'&&
      certifyWalkMotion(step.from,step.to,graph,connector)!==null)).toBe(true);

    const session=new PathfindingTestSession(graph,connector,start);
    const safe=Reflect.get(session,'motionSafeRoute') as (a:SpatialPoint,b:SpatialPoint)=>boolean;
    expect(safe.call(session,start,goal)).toBe(true);
    const actual=session.pedestrians.add({id:'actor',from:start,to:goal,speed:0.4});
    expect(actual.status).toBe('READY');
    if(actual.status!=='READY')return;
    expect(actual.points.some(p=>p[2]<-0.1)).toBe(true);
    for(let i=0;i<250;i++)session.tick(0.05);
    const actor=session.snapshots()[0];
    expect(actor.status).toBe('arrived');
    expect(actor.position).toEqual(goal);
  });
});


describe('completed-wave reshuffles',()=>{
  const beach=-2.15;
  const onPlane:PmoTerrainConnector={
    project:(p):SpatialPoint=>[p[0],beach,p[2]],
    verify:(a,b)=>a[1]===beach&&b[1]===beach,
  };
  const planeGraph=compilePmoBrushCorridors(
    [{center:[0,beach,0],radius:3.3,sourceId:'walk'}],onPlane,[],
    {step:0.18,maxWalkLink:0.28},
  );
  const positions:SpatialPoint[]=[[-2,beach,0],[2,beach,0],[-1,beach,2],
    [1,beach,2],[0,beach,-2],[-2,beach,-1],[2,beach,-1]];
  const sites=positions.map((anchor,i)=>({id:`fixture-${i}`,name:`building_${i+1}`,anchor}));
  const setup=(ground:PmoTerrainConnector=onPlane)=>{
    const session=new PathfindingTestSession(planeGraph,ground,[0,beach,0],undefined,sites);
    session.shuffle(1312);
    return session;
  };

  it('keeps completed guests arrived and permits the next sequential wave',()=>{
    const session=setup();session.spawnWave(2,2026);
    for(let tick=0;tick<3000 && (session.progress().queued>0 ||
      session.snapshots().some(s=>s.status!=='arrived'));tick++)session.tick(0.05);
    const before=session.snapshots();
    expect(before).toHaveLength(2);
    expect(before.every(s=>s.status==='arrived')).toBe(true);
    const reshuffle=session.shuffle(1421);
    expect(reshuffle.rerouted).toBe(0);
    expect(reshuffle.blocked).toBe(0);
    expect(session.snapshots()).toEqual(before);
    expect(session.spawnWave(1,2027).accepted).toBe(1);
  });

  it('rejects an unphysical shuffle before altering the committed layout or blocking an actor',()=>{
    const connector:PmoTerrainConnector={
      project:(p):SpatialPoint=>[p[0],beach,p[2]],
      verify:(a,b)=>a[1]===beach&&b[1]===beach,
    };
    const session=setup(connector);session.spawnWave(1,11);session.tick(.05);
    const before=session.snapshots();
    const previousLayout=session.scenario;
    // Emulate a non-projectable location beneath a moving actor without
    // altering the already compiled graph or the original PMO authority.
    connector.project=()=>null;
    expect(()=>session.shuffle(12)).toThrow('PMO_TEST_RESHUFFLE_NO_PHYSICALLY_SAFE_LAYOUT');
    expect(session.scenario).toBe(previousLayout);
    expect(session.snapshots()).toEqual(before);
    expect(session.snapshots()[0].status).not.toBe('blocked');
  });
});
