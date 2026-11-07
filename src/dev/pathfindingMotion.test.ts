import {describe,it,expect} from 'vitest';
import {compilePmoBrushCorridors,type SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {PathfindingTestSession} from './pathfindingTestSession';

const y=-2.15;
const connector={project:(p:SpatialPoint):SpatialPoint=>[p[0],y,p[2]],verify:(a:SpatialPoint,b:SpatialPoint)=>a[1]===y&&b[1]===y};
const graph=compilePmoBrushCorridors([{center:[0,y,0] as SpatialPoint,radius:3.3,sourceId:'beach'}],connector,[],{step:.18,maxWalkLink:.28});
const sitePositions:SpatialPoint[]=[[-2,y,0],[2,y,0],[-1,y,2],[1,y,2],[0,y,-2],[-2,y,-1],[2,y,-1]];
const sites=sitePositions.map((anchor,i)=>({id:'fixture-pmo-'+i,name:'building_'+(i+1),anchor}));
function session(){const s=new PathfindingTestSession(graph,connector,[0,y,0],undefined,sites);s.shuffle(1312);return s;}
const distance=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

describe('RRH real-frame wave movement regression',()=>{
  it('releases wave progressively and actually advances a single first guest',()=>{
    const s=session();const wave=s.spawnWave(12,461);
    expect(wave.accepted).toBe(1);
    expect(wave.queued).toBe(11);
    const p0=s.snapshots()[0].position;
    for(let i=0;i<70;i++)s.tick(.05);
    const after=s.snapshots().find(a=>a.id==='pmo-test-guest-1')!;
    expect(distance(after.position,p0)).toBeGreaterThan(.2);
    expect(after.fault).toBeNull();
    expect(s.progress().emitted).toBeGreaterThan(1);
  });
  it('twelve guests complete on a connected verified graph without beach gridlock',()=>{
    const s=session();s.spawnWave(12,461);
    for(let i=0;i<900;i++)s.tick(.05);
    expect(s.progress().queued).toBe(0);
    expect(s.snapshots()).toHaveLength(12);
    expect(s.snapshots().every(a=>a.status==='arrived')).toBe(true);
  });
  it('repositions goals on reshuffle without teleportation and continues advancing',()=>{
    const s=session();s.spawnWave(12,461);
    for(let i=0;i<100;i++)s.tick(.05);
    const before=new Map(s.snapshots().map(a=>[a.id,a.position]));
    s.shuffle(1903);
    for(const a of s.snapshots())expect(a.position).toEqual(before.get(a.id));
    for(let i=0;i<300;i++)s.tick(.05);
    expect(s.snapshots().some(a=>a.status==='arrived')).toBe(true);
  });
});
