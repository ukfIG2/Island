import {describe,it,expect} from 'vitest';
import type {BrushGraph, PmoTerrainConnector, SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {generatePmoDevBuildings, auditPmoBuildingSiteReachability, type CanonicalPmoBuildingSite} from './pmoDevBuildings';

const sites:CanonicalPmoBuildingSite[]=Array.from({length:9},(_,i)=>({
  id:`fixed-pmo-id-${i+1}`,name:`building_${i+1}`,anchor:[i*2,0,0]
}));
const nodes=[{id:0,point:[0,0,1] as SpatialPoint,sources:['walk']},
  ...sites.map((site,i)=>({id:i+1,point:[site.anchor[0],0,1] as SpatialPoint,sources:['walk']}))];
const graph:BrushGraph={nodes,neighbors:nodes.map((_,i)=>
  nodes.flatMap((n,j)=>j===i?[]:[{to:j,cost:Math.abs(j-i)+1,kind:'walk' as const}])),
  stamps:[{center:[0,0,1],radius:20,sourceId:'walk'}],helpers:{},rejectedHelpers:[],
  rules:{step:.18,maxGrade:.72,maxStepY:.2,maxWalkLink:.32,paintHeightTolerance:.52}};
const connector:PmoTerrainConnector={project:p=>p,verify:()=>true};
describe('Canonical nine-PMO-site pathfinding stand',()=>{
  it('selects exactly five distinct named PMOs in each of 1000 shuffles and covers all nine',()=>{
    const coverage=new Set<string>();
    for(let i=1;i<=1000;i++){
      const seed=Math.imul(i,0x9e3779b9)>>>0;
      const scenario=generatePmoDevBuildings(graph,connector,seed,{allowedSites:sites,desiredEntry:[0,0,1]});
      expect(scenario.buildings).toHaveLength(5);
      expect(new Set(scenario.buildings.map(b=>b.pmoSiteId)).size).toBe(5);
      expect(scenario.stats.authoredSiteCount).toBe(9);
      for(const b of scenario.buildings){
        expect(b.position).toEqual(sites[b.siteIndex].anchor);
        expect(b.pmoSiteId).toBe(sites[b.siteIndex].id);
        coverage.add(b.pmoSiteId);
      }
    }
    expect(coverage.size).toBe(9);
  });
  it('audits all nine even though only five service models exist',()=>{
    expect(auditPmoBuildingSiteReachability(graph,connector,[0,0,1],sites)).toHaveLength(9);
  });
  it('rejects anonymous coordinate-only placement input',()=>{
    expect(()=>generatePmoDevBuildings(graph,connector,1,{allowedSites:
      [[0,0,0],[2,0,0],[4,0,0],[6,0,0],[8,0,0]] as unknown as CanonicalPmoBuildingSite[]
    })).toThrow('PMO_DEV_AUTHORED_BUILDING_SITES_REQUIRED');
  });
});
