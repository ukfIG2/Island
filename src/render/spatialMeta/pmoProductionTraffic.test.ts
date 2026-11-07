import {describe,it,expect} from 'vitest';
import {compilePmoBrushCorridors,type SpatialPoint} from './pmoBrushCorridors';
import {PmoWavePedestrianTraffic} from './pmoWavePedestrianTraffic';
import {auditedApproaches,siteByNeed} from './pmoProductionSiteEndpoints';
import type {NeedCounts} from '../../core/state';
const p=(x:number,z:number):SpatialPoint=>[x,0,z];
const connector={project:(q:SpatialPoint)=>[...q] as SpatialPoint,verify:()=>true};
const g=compilePmoBrushCorridors(Array.from({length:11},(_,i)=>({center:p(i*.14,0),radius:.19,sourceId:'paint'})),connector);
const fakeLift={reserve:()=>true,release:()=>{},ride:()=>null} as never;
const release=(n:number):NeedCounts=>({reception:n,food:0,drinks:0,relax:0,oceanView:0});
describe('Core-driven production pedestrian integration',()=>{
 it('spawns on actual walk paint, never increments Core counters',()=>{
  const traffic=new PmoWavePedestrianTraffic(g,connector,p(0,0),{reception:p(1.4,0)},new Map(),fakeLift,3);
  const before=release(3);
  traffic.update({waveNumber:1,phase:'incoming',releasedByNeed:before});
  for(let i=0;i<30;i++)traffic.tick(.05);
  expect(traffic.status().admitted).toBeGreaterThan(0);
  expect(before.reception).toBe(3);
  expect(traffic.snapshots()[0].position[0]).toBeGreaterThanOrEqual(0);
 });
 it('no figures before the Core actually releases demand',()=>{
  const traffic=new PmoWavePedestrianTraffic(g,connector,p(0,0),{reception:p(1.4,0)},new Map(),fakeLift);
  traffic.update({waveNumber:1,phase:'incoming',releasedByNeed:release(0)});
  for(let i=0;i<20;i++)traffic.tick(.05);
  expect(traffic.status().admitted).toBe(0);
 });
 it('awaiting/draining/complete do not issue new beach arrivals',()=>{
  for(const phase of ['awaiting','draining','complete'] as const){
   const traffic=new PmoWavePedestrianTraffic(g,connector,p(0,0),{reception:p(1.4,0)},new Map(),fakeLift);
   traffic.update({waveNumber:1,phase,releasedByNeed:release(3)});
   for(let i=0;i<20;i++)traffic.tick(.05);
   expect(traffic.status().admitted).toBe(0);
  }
 });
 it('rejects an unpainted target rather than teleporting to destination',()=>{
  const traffic=new PmoWavePedestrianTraffic(g,connector,p(0,0),{reception:p(5,0)},new Map(),fakeLift);
  traffic.update({waveNumber:1,phase:'incoming',releasedByNeed:release(2)});
  for(let i=0;i<20;i++)traffic.tick(.05);
  expect(traffic.status().admitted).toBe(0);
  expect(traffic.status().reason).toContain('ROUTE_REJECTED');
 });
 it('buildings are matched to authored site approach, not their occupied volume',()=>{
  const sites=[{id:'b1',name:'building_1',anchor:p(0,.55)}];
  const approaches=auditedApproaches(g,p(0,0),sites);
  expect(approaches.get('b1')).toBeDefined();
  const result=siteByNeed(sites,approaches,{reception:p(.05,.55)});
  expect(result.reception).toEqual(approaches.get('b1'));
 });
 it('new wave resets old traveller identities',()=>{
  const traffic=new PmoWavePedestrianTraffic(g,connector,p(0,0),{reception:p(1.4,0)},new Map(),fakeLift);
  traffic.update({waveNumber:1,phase:'incoming',releasedByNeed:release(3)});
  for(let i=0;i<12;i++)traffic.tick(.05);
  expect(traffic.status().admitted).toBe(1);
  traffic.update({waveNumber:2,phase:'awaiting',releasedByNeed:release(0)});
  expect(traffic.snapshots()).toHaveLength(0);
  expect(traffic.status().admitted).toBe(0);
 });
});
