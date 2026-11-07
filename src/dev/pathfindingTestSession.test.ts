import { describe, it, expect } from 'vitest';
import { compilePmoBrushCorridors, type SpatialPoint } from '../render/spatialMeta/pmoBrushCorridors';
import { PathfindingTestSession, choosePmoBeachStart } from './pathfindingTestSession';
import { generatePmoDevBuildings } from './pmoDevBuildings';

const y=-2.15;
const connector={
  project:(p:SpatialPoint):SpatialPoint=>[p[0],y,p[2]],
  verify:(a:SpatialPoint,b:SpatialPoint)=>a[1]===y&&b[1]===y
};
const graph=compilePmoBrushCorridors([{center:[0,y,0] as SpatialPoint,radius:3.3,sourceId:'walk'}],connector,[],{
  step:0.18,maxWalkLink:0.28
});
const sitePositions:SpatialPoint[]=[[-2,y,0],[2,y,0],[-1,y,2],[1,y,2],[0,y,-2],[-2,y,-1],[2,y,-1]];
const zones=sitePositions.map((anchor,i)=>({id:'fixture-pmo-'+i,name:'building_'+(i+1),anchor}));
function harness(){
  const session=new PathfindingTestSession(graph,connector,[0,y,0],undefined,zones);
  session.shuffle(1312);
  return session;
}
const dist=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

describe('same-scene PMO pathfinding test controller',()=>{
  it('uses exactly five distinct author-approved building zones',()=>{
    const session=harness();
    const sites=session.scenario!.buildings;
    expect(sites).toHaveLength(5);
    const used=new Set<number>();
    for(const site of sites){
      expect(site.routeStatus).toBe('READY');
      const j=zones.findIndex(zone=>Math.hypot(site.position[0]-zone.anchor[0],site.position[2]-zone.anchor[2])<.34);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(used.has(j)).toBe(false);
      used.add(j);
    }
  });
  it('spawns a wave on the beach graph and moves with no frame-sized teleport',()=>{
    const session=harness();
    const wave=session.spawnWave(8,461);
    expect(wave.accepted).toBe(1);
    let before=session.snapshots();
    for(let i=0;i<60;i++){
      session.tick(.05);
      const next=session.snapshots();
      // The queue emits new guests during this test: compare existing actors by identity.
      const priorById=new Map(before.map(actor=>[actor.id,actor.position]));
      next.forEach(actor=>{
        const prior=priorById.get(actor.id);
        if(prior)expect(dist(actor.position,prior)).toBeLessThan(.08);
      });
      before=next;
    }
    expect(before.some(p=>Math.hypot(p.position[0],p.position[2])>.2)).toBe(true);
  });
  it('replans all moving guests at their current physical coordinates on shuffle',()=>{
    const session=harness();session.spawnWave(8,461);session.tick(.05);
    const before=new Map(session.snapshots().map(a=>[a.id,a.position]));
    const shuffle=session.shuffle(1903);
    expect(shuffle.scenario.buildings).toHaveLength(5);
    for(const actor of session.snapshots()) expect(actor.position).toEqual(before.get(actor.id));
  });
  it('rejects a beach connection without the actual beach height',()=>{
    expect(choosePmoBeachStart(graph,[0,y,0])).not.toBeNull();
    const bogus={...graph,nodes:graph.nodes.map(node=>({...node,point:[node.point[0],0,node.point[2]] as SpatialPoint}))};
    expect(choosePmoBeachStart(bogus,[0,y,0])).toBeNull();
  });
  it('resolves authored building footprints even when NO walking node is within the old 0.32 radius',()=>{
    const outsidePositions:SpatialPoint[] = [[3.9,y,0],[-3.9,y,0],[0,y,3.9],[0,y,-3.9],[2.75,y,2.75]];
    const outside=outsidePositions.map((anchor,i)=>({id:'outside-pmo-'+i,name:'building_'+(i+1),anchor}));
    for(let seed=1;seed<=100;seed++){
      const layout=generatePmoDevBuildings(graph,connector,seed,{desiredEntry:[0,y,0],allowedSites:outside});
      expect(layout.buildings).toHaveLength(5);
      expect(layout.stats.reachableBuildings).toBe(5);
      for(const building of layout.buildings){
        expect(building.position).toEqual(outside[building.siteIndex].anchor);
        expect(building.arrivalPoint).not.toBeNull();
        expect(dist(building.position,building.arrivalPoint!)).toBeGreaterThan(.32);
        expect(building.routeStatus).toBe('READY');
      }
    }
  });
  it('renders 5 authored sites even when navigation is disconnected, disclosing route failure',()=>{
    const disconnected={...graph,neighbors:graph.neighbors.map(()=>[])};
    const layout=generatePmoDevBuildings(disconnected,connector,33,{desiredEntry:[0,y,0],allowedSites:zones});
    expect(layout.buildings).toHaveLength(5);
    expect(layout.stats.reachableBuildings).toBe(0);
    expect(layout.failures).toHaveLength(5);
  });
  it('stops stale motions on unreachable destination and preserves coordinates',()=>{
    const session=harness();session.spawnWave(4,461);
    const actor=session.snapshots()[0];
    session.pedestrians.halt(actor.id,'UNREACHABLE_SITE');
    const stopped=session.snapshots().find(a=>a.id===actor.id)!;
    expect(stopped.status).toBe('blocked');
    expect(stopped.position).toEqual(actor.position);
    session.tick(.05);
    expect(session.snapshots().find(a=>a.id===actor.id)!.position).toEqual(actor.position);
  });
  it('fails closed without moving a pedestrian when new goal is unreachable',()=>{
    const session=harness();session.spawnWave(4,461);
    const actor=session.snapshots()[0];expect(actor).toBeDefined();
    const route=session.pedestrians.reroute(actor.id,[99,y,99]);
    expect(route.status).not.toBe('READY');
    expect(session.snapshots()[0].position).toEqual(actor.position);
  });
});
