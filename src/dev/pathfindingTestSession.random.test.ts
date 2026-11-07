import {describe,it,expect} from 'vitest';
import type {BrushGraph} from '../render/spatialMeta/pmoBrushCorridors';
import {PathfindingTestSession} from './pathfindingTestSession';
import {generatePmoDevBuildings} from './pmoDevBuildings';
const sites=Array.from({length:9},(_,i)=>({id:'authored-'+(i+1),name:'building_'+(i+1),anchor:[3*(i+1)+0.75,-2,0] as [number,number,number]}));
const nodes=[{id:0,point:[0,-2,0] as [number,number,number],sources:['walk']}].concat(
  sites.map((_,i)=>({id:i+1,point:[3*(i+1),-2,0] as [number,number,number],sources:['walk']})));
const neighbors=nodes.map(()=>[] as {to:number;cost:number;kind:'walk'}[]);
for(let i=1;i<=3;i++){
  neighbors[0].push({to:i,cost:i*3,kind:'walk'});
  neighbors[i].push({to:0,cost:i*3,kind:'walk'});
}
const graph:BrushGraph={nodes,neighbors,
  stamps:nodes.map(n=>({center:n.point,radius:1.2,sourceId:'walk'})),
  helpers:{},rejectedHelpers:[],
  rules:{step:0.14,maxWalkLink:0.32,maxGrade:0.72,maxStepY:0.20,paintHeightTolerance:0.52}};
const connector={project:(p:[number,number,number])=>p,verify:()=>true};
describe('dev wave while canonical graph is still partially disconnected',()=>{
  it('samples all nine sites but always retains one truly reachable service',()=>{
    let originalAllBlocked=0;
    const chosen=new Set<string>();
    for(let seed=1;seed<=250;seed++){
      const old=generatePmoDevBuildings(graph,connector,seed,{allowedSites:sites,desiredEntry:[0,-2,0]});
      if(old.stats.reachableBuildings===0)originalAllBlocked++;
      const session=new PathfindingTestSession(graph,connector,[0,-2,0],undefined,sites);
      const {scenario}=session.shuffle(seed);
      expect(scenario.buildings.length).toBe(5);
      expect(scenario.stats.reachableBuildings).toBeGreaterThan(0);
      for(const item of scenario.buildings)chosen.add(item.pmoSiteName);
      expect(session.spawnWave(12,seed).accepted).toBe(1);
    }
    expect(originalAllBlocked).toBeGreaterThan(0);
    expect(chosen.size).toBe(9);
  });
});
