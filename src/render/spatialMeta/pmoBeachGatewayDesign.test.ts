import { describe, expect, it } from 'vitest';
import authored from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
import { projectPmoTransitionStructures } from './pmoTransitionStructures';
import { BEACH_GATEWAY_ID, designPmoBeachGateway } from './pmoBeachGatewayDesign';
import type { SpatialRegistry } from './registry';
import type { PmoLandingExtension } from './pmoLandingRepair';
import type { PmoDockExtension } from './pmoTransitionDockRepair';

const stair=projectPmoTransitionStructures(structuredClone(authored) as unknown as SpatialRegistry)
  .find(x=>x.sourceId===BEACH_GATEWAY_ID)!;
const tinyLanding:PmoLandingExtension={
  id:'pmo-landing:'+BEACH_GATEWAY_ID,sourceId:BEACH_GATEWAY_ID,edgeId:'land-edge',
  from:[2.1,-1.229,3.62],to:[2.18,-1.04,3.55],portalA:'p0',portalB:'p1',
  physicalSamples:[[2.1,-1.229,3.62],[2.12,-1.20,3.61],[2.14,-1.16,3.58],[2.16,-1.10,3.56],[2.18,-1.04,3.55]],
  treads:[{center:[2.12,-1.217,3.61],yaw:0.6,length:0.052,width:0.27,top:-1.20}]
};
const dock:PmoDockExtension={id:'pmo-dock',structureSourceId:BEACH_GATEWAY_ID,edgeId:'dock',side:1,
 kind:'stairs',portalId:'p2',walkNodeId:'walk',from:[2.18,-1.04,3.55],to:[2.2,-1.02,3.52],
 physicalSamples:[[2.18,-1.04,3.55],[2.19,-1.03,3.53],[2.2,-1.02,3.52]],
 treads:[{center:[2.19,-1.047,3.53],yaw:0.6,length:0.04,width:0.3}]};

describe('main island gateway: one visible projection of existing physical carriers',()=>{
  it('uses authored stair top positions, without editing the authoritative PMO',()=>{
    const before=JSON.stringify(stair);
    const design=designPmoBeachGateway(stair,[],[]);
    expect(design).not.toBeNull();
    expect(design!.stones).toHaveLength(stair.segments.length);
    for(let i=0;i<stair.segments.length;i++){
      expect(design!.stones[i].center).toEqual(stair.segments[i].center);
      expect(design!.stones[i].top).toBeCloseTo(stair.segments[i].center[1]+0.017,10);
      expect(design!.stones[i].width).toBe(stair.segments[i].width);
    }
    expect(JSON.stringify(stair)).toBe(before);
  });
  it('consolidates authored stair and its own *physical* landings/docks only',()=>{
    const design=designPmoBeachGateway(stair,[tinyLanding,{...tinyLanding,id:'other',sourceId:'other'}],
      [dock,{...dock,id:'other-dock',structureSourceId:'other'}]);
    expect(design!.stones).toHaveLength(stair.segments.length+2);
    expect(design!.physicalSources).toEqual([BEACH_GATEWAY_ID,tinyLanding.id,dock.id]);
    expect(design!.stones[stair.segments.length].top).toBe(tinyLanding.treads[0].top);
    expect(design!.stones[stair.segments.length+1].top).toBeCloseTo(dock.treads[0].center[1]+.017,10);
  });
  it('rejects malformed or alien carrier instead of inventing a route',()=>{
    expect(designPmoBeachGateway({...stair,sourceId:'wrong'},[],[])).toBeNull();
    expect(designPmoBeachGateway({...stair,segments:[...stair.segments.slice(0,-1),
      {...stair.segments[stair.segments.length-1],center:[0,NaN,0]}]},[],[])).toBeNull();
  });
});
