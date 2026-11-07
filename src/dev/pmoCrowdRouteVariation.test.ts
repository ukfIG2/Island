import {describe,it,expect} from 'vitest';
import {CrowdRouteVariation} from './pmoCrowdRouteVariation';
import {crowdSpeed} from './pmoCrowdSpeed';
import type {BrushGraph,PmoTerrainConnector,RouteResult,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const graph={rules:{maxWalkLink:.30,maxGrade:.72,maxStepY:.2,paintHeightTolerance:.52,step:.14},nodes:[],neighbors:[],stamps:[],helpers:{},rejectedHelpers:[]} as BrushGraph;
const terrain:PmoTerrainConnector={project:p=>[...p],verify:()=>true};
const route=(withHelper=false):RouteResult=>{
 const steps=Array.from({length:22},(_,i)=>({kind:'walk' as const,from:[i*.14,0,0] as SpatialPoint,
  to:[(i+1)*.14,0,0] as SpatialPoint,brushSourceIds:[]}));
 if(withHelper)steps.splice(10,0,{kind:'lift' as 'walk',from:[1.4,0,0],to:[1.4,0,0],brushSourceIds:[]});
 return {status:'READY',points:steps.map(x=>[...x.from]),steps,distance:3.08,brushSourceIds:[]};
};
describe('non-cosmetic crowd route variability',()=>{
 it('varies real waypoints by a large amount while preserving endpoint/step continuity',()=>{
  const original=route();const variation=new CrowdRouteVariation(graph,terrain,()=>true,.38,.5);
  const amended=variation.apply('crowd-051',original);
  expect(amended.status).toBe('READY');if(amended.status!=='READY'||original.status!=='READY')return;
  expect(variation.stats.accepted).toBeGreaterThan(1);
  expect(variation.stats.largest).toBeGreaterThanOrEqual(.30);
  for(let i=0;i<amended.steps.length-1;i++)expect(amended.steps[i].to).toEqual(amended.steps[i+1].from);
  expect(amended.steps[0].from).toEqual(original.steps[0].from);
  expect(amended.steps.at(-1)?.to).toEqual(original.steps.at(-1)?.to);
 });
 it('does not fabricate jitter when physical certification rejects it',()=>{
  const variation=new CrowdRouteVariation(graph,terrain,()=>false,.38,.5);
  const original=route();const altered=variation.apply('crowd-051',original);
  expect(altered).toEqual(original);
  expect(variation.stats.accepted).toBe(0);
 });
 it('gives stable, markedly different walking speeds',()=>{
  const readings=Array.from({length:100},(_,i)=>crowdSpeed('crowd-'+String(i+1).padStart(3,'0')));
  expect(Math.max(...readings)-Math.min(...readings)).toBeGreaterThan(.20);
  expect(readings.every(x=>x>=.23&&x<=.65)).toBe(true);
  expect(crowdSpeed('crowd-023')).toBe(crowdSpeed('crowd-023'));
 });
});
