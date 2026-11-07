import {describe,it,expect} from 'vitest';
import {verifyNaturalLift9Access} from './pmoNaturalLift9Access';
import type {NavigationGraph} from './navigation';
const at=(x:number,z:number)=>[x,-.92,z] as [number,number,number];
const base=():NavigationGraph=>({schemaVersion:1,issues:[],nodes:{
  east:{id:'east',role:'walk',position:at(-.84,3.36),sourceId:'paint'},
  north:{id:'north',role:'walk',position:at(-1.12,3.5),sourceId:'paint'},
  west:{id:'west',role:'walk',position:at(-2.10,3.08),sourceId:'paint'},
  lift:{id:'lift',role:'portal',position:at(-2.0794,2.9613),sourceId:'lift'}
},outgoing:{east:[],north:[],west:[{to:'lift',mode:'bridge',cost:.12,sourceId:'pmo-dock:liftid:0'}],
  lift:[{to:'west',mode:'bridge',cost:.12,sourceId:'pmo-dock:liftid:0'}]}});
const connector={project:(p:[number,number,number])=>p,verify:()=>true};
describe('building_8 natural-west pickup, no added bridge',()=>{
 it('accepts a bidirectional pre-existing painted path and dock',()=>{
  const g=base();g.outgoing.east.push({to:'north',cost:1,mode:'walk',sourceId:'paint'});
  g.outgoing.north.push({to:'east',cost:1,mode:'walk',sourceId:'paint'},
    {to:'west',cost:1,mode:'walk',sourceId:'paint'});
  g.outgoing.west.push({to:'north',cost:1,mode:'walk',sourceId:'paint'});
  expect(verifyNaturalLift9Access(g,'east','lift','liftid',connector).certified).toBe(true);
 });
 it('does not infer crossing when the west paint bank is isolated',()=>{
  const g=base();expect(verifyNaturalLift9Access(g,'east','lift','liftid',connector).certified).toBe(false);
 });
 it('rejects the missing physical west-bank dock',()=>{
  const g=base();g.outgoing.lift=[];
  expect(verifyNaturalLift9Access(g,'east','lift','liftid',connector).diagnostic).toContain('NO_EXISTING_CERTIFIED_DOCK');
 });
 it('refuses a one-way walk connection',()=>{
  const g=base();g.outgoing.east=[{to:'west',cost:1,mode:'walk',sourceId:'paint'}];
  expect(verifyNaturalLift9Access(g,'east','lift','liftid',connector).certified).toBe(false);
 });
});
