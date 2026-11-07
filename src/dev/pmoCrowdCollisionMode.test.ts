import {describe,it,expect} from 'vitest';
import {crowdCollisionSpacing} from './pmoCrowdCollisionMode';
import {PmoPedestrianRuntime} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';

const start:SpatialPoint=[0,0,0],end:SpatialPoint=[0.24,0,0];
const graph:BrushGraph={
  nodes:[{id:0,point:start,sources:['paint']},{id:1,point:end,sources:['paint']}],
  neighbors:[[{to:1,cost:.24,kind:'walk'}],[{to:0,cost:.24,kind:'walk'}]],
  stamps:[{center:[.12,0,0],radius:.5,sourceId:'paint'}],
  helpers:{},rejectedHelpers:[],
  rules:{maxGrade:.72,maxStepY:.2,step:.14,maxWalkLink:.32,paintHeightTolerance:.52},
};
const flat:PmoTerrainConnector={project:p=>[...p],verify:()=>true};

describe('Crowd 100 guest-to-guest collision A/B (dev-only)',()=>{
  it('defaults to no guest collision, while query param restores original 8.5cm',()=>{
    expect(crowdCollisionSpacing()).toBe(0);
    expect(crowdCollisionSpacing('?crowd=beach')).toBe(0);
    expect(crowdCollisionSpacing('?crowdCollision=off')).toBe(0);
    expect(crowdCollisionSpacing('?crowdCollision=on')).toBe(.085);
    expect(crowdCollisionSpacing('?crowd=beach&crowdCollision=on')).toBe(.085);
  });
  it('permits 2 peers to share the same walk origin and arrive when disabled',()=>{
    const motor=new PmoPedestrianRuntime(graph,flat,{collisionSpacing:crowdCollisionSpacing()});
    expect(motor.add({id:'a',from:start,to:end,speed:.3}).status).toBe('READY');
    expect(motor.add({id:'b',from:start,to:end,speed:.3}).status).toBe('READY');
    for(let i=0;i<350;i++)motor.tick(.02);
    expect(motor.snapshots().map(x=>x.status)).toEqual(['arrived','arrived']);
    expect(motor.snapshots().every(x=>x.fault===null)).toBe(true);
  });
  it('keeps the old spawn collision when explicitly enabled',()=>{
    const motor=new PmoPedestrianRuntime(graph,flat,{collisionSpacing:crowdCollisionSpacing('?crowdCollision=on')});
    expect(motor.add({id:'a',from:start,to:end}).status).toBe('READY');
    expect(motor.add({id:'b',from:start,to:end})).toMatchObject({status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'});
  });
  it('still blocks genuinely impassable terrain with collisions disabled',()=>{
    const cliff:PmoTerrainConnector={project:p=>[p[0],p[0]<.1?0:.085,p[2]],verify:()=>true};
    const motor=new PmoPedestrianRuntime(graph,cliff,{collisionSpacing:crowdCollisionSpacing()});
    expect(motor.add({id:'a',from:start,to:end}).status).toBe('READY');
    for(let i=0;i<400&&motor.snapshots()[0].status!=='blocked';i++)motor.tick(.0167);
    const actor=motor.snapshots()[0];
    expect(actor.status).toBe('blocked');
    expect(actor.fault).toMatch(/^WALK_/);
    expect(actor.position[0]).toBeLessThan(.1);
  });
});
