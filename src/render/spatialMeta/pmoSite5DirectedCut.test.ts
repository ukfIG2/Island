import {describe,it,expect} from 'vitest';
import {repairSite5DirectedCut} from './pmoSite5DirectedCut';
import {routeNavigation,type NavigationGraph,type NavNode} from './navigation';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTerrainConnector} from './pmoBrushCorridors';
const point=(x:number,y:number,z:number):[number,number,number]=>[x,y,z];
const pos={lower:point(2.70,-.9812,1.10),p0:point(2.7129,-.9812,1.1988),p1:point(3.3713,-.4341,.4165),upper:point(3.50,-.4341,.42)};
const port=(id:string,position:[number,number,number],role:'walk'|'portal'):NavNode=>({id,position,role,sourceId:'canonical-paint'});
const structures=[{kind:'stairs',from:pos.lower,to:pos.p1,sourceId:'test-stair',edgeId:'edge'}] as PmoStructure[];
const connector:PmoTerrainConnector={project(p){return [...p];},verify(){return true;}};
function fixture():NavigationGraph {return {schemaVersion:1,issues:[],nodes:{
 lower:port('lower',pos.lower,'walk'),p0:port('p0',pos.p0,'portal'),p1:port('p1',pos.p1,'portal'),upper:port('upper',pos.upper,'walk')},
 outgoing:{lower:[{to:'p0',cost:0,mode:'walk',sourceId:'paint'}],p0:[{to:'lower',cost:0,mode:'walk',sourceId:'paint'},{to:'p1',cost:1,mode:'stairs',sourceId:'test-stair'}],
 p1:[{to:'p0',cost:1,mode:'stairs',sourceId:'test-stair'},{to:'upper',cost:.13,mode:'walk',sourceId:'paint'}],upper:[]}};}
describe('site5 directed cut v3',()=>{
 it('connects the actual one-way physical cut, not an arbitrary close edge',()=>{
  const before=fixture(); expect(routeNavigation(before,'lower','upper').found).toBe(true);
  expect(routeNavigation(before,'upper','lower').found).toBe(false);
  const result=repairSite5DirectedCut(before,structures,connector);
  expect(result.reconnected).toBe(true);
  expect(result.newNodes).toBeGreaterThan(0);
  expect(routeNavigation(result.graph,'upper','lower').found).toBe(true);
  expect(routeNavigation(result.graph,'lower','upper').found).toBe(true);
 });
 it('bridges a physical cut even when there is NO existing crossing walk edge',()=>{
  // A supported physical helper can carry traffic in, while no reverse
  // walk edge exists to select. v2 incorrectly returned NO_MOTOR_CUT_EDGE.
  const before=fixture();
  before.outgoing.p1=[{to:'p0',cost:1,mode:'stairs',sourceId:'test-stair'},
    {to:'upper',cost:.13,mode:'bridge',sourceId:'test-surface'}];
  expect(routeNavigation(before,'lower','upper').found).toBe(true);
  expect(routeNavigation(before,'upper','lower').found).toBe(false);
  const result=repairSite5DirectedCut(before,structures,connector);
  expect(result.diagnostics[0]).toContain('V3_PHYSICAL_RECONNECTED');
  expect(routeNavigation(result.graph,'upper','lower').found).toBe(true);
  expect(routeNavigation(result.graph,'lower','upper').found).toBe(true);
 });
 it('fails closed with no authorized physical interpolation',()=>{
  const bad:PmoTerrainConnector={project(){return null;},verify(){return true;}};
  const base=fixture(),result=repairSite5DirectedCut(base,structures,bad);
  expect(result.reconnected).toBe(false);
  expect(result.graph).toBe(base);
  expect(result.diagnostics.join(' ')).toContain('PMO_SITE5_CUT_');
 });
 it('does nothing if both directions already reach each other',()=>{
  const base=fixture();base.outgoing.upper.push({to:'p1',cost:.13,mode:'walk',sourceId:'paint'});
  const result=repairSite5DirectedCut(base,structures,connector);
  expect(result.reconnected).toBe(false);
  expect(result.graph).toBe(base);
  expect(result.diagnostics[0]).toContain('ALREADY_MOTOR_CONNECTED');
 });
});
