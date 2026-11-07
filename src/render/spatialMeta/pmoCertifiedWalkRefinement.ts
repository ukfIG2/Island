/** Locally refine an already authored walk corridor whose coarse PMO lattice
 * leaves a directionally unsafe edge. Every proposed point must project onto
 * the published PMO-approved terrain. Each new small edge is independently
 * certified in BOTH directions by the production 6mm pedestrian motor gate.
 * No synthetic stairs, permission widening, authoring change or teleports.
 */
import type {NavigationGraph, NavNode, NavEdge} from './navigation';
import type {SpatialPoint, SpatialRegistry} from './registry';
import type {PmoTerrainConnector} from './pmoBrushCorridors';
import type {PmoStructure} from './pmoTransitionStructures';
import {readPmoWalkAuthorization, isPmoPaintAuthorized} from './pmoWorldBindings';
import {certifyDirectedWalk} from './pmoWalkKinematics';

const dxz=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const rule={rules:{step:.18,maxWalkLink:.32,maxGrade:.72,maxStepY:.20,paintHeightTolerance:.52}};
const copy=(p:SpatialPoint):SpatialPoint=>[p[0],p[1],p[2]];
export interface CertifiedWalkRefinement {graph:NavigationGraph;diagnostics:string[];repairedPairs:number;newNodes:number;}

/** Only operate at the first 4-to-5 authored stair's upper exit, not island-wide. */
export function refineFifthSiteWalkExit(graph:NavigationGraph,registry:SpatialRegistry,
  structures:readonly PmoStructure[],connector:PmoTerrainConnector):CertifiedWalkRefinement{
  const unchanged=(code:string,more=''):CertifiedWalkRefinement=>({graph,repairedPairs:0,newNodes:0,
    diagnostics:[`PMO_SITE5_REVERSE_EXIT_${code}${more?':'+more:''}`]});
  const stair=structures.find(s=>s.kind==='stairs'&&s.from[1]<-.85&&s.to[1]>-.75&&
    s.from[0]>2.55&&s.from[0]<2.85&&s.to[0]>3.25&&s.to[0]<3.50);
  if(!stair)return unchanged('STAIR_NOT_PRESENT');
  const marks=readPmoWalkAuthorization(registry);
  const paintId=(p:SpatialPoint)=>marks.find(s=>dxz(s.center,p)<=s.radius+1e-8&&
    Math.abs(s.center[1]-p[1])<=.52)?.sourceId;
  const candidates=Object.values(graph.nodes).filter(n=>n.role==='walk'&&
    dxz(n.position,stair.to)<.84&&Math.abs(n.position[1]-stair.to[1])<.31);
  const byId=new Set(candidates.map(n=>n.id));
  if(candidates.length<2)return unchanged('NO_LOCAL_APPROACH');
  const tested=new Map<string,boolean>();
  const safe=(a:SpatialPoint,b:SpatialPoint)=>{
    const key=a.map(v=>v.toFixed(5)).join(',')+'|'+b.map(v=>v.toFixed(5)).join(',');
    if(tested.has(key))return tested.get(key)!;
    const ok=dxz(a,b)>1e-6&&dxz(a,b)<=.19&&
      Math.abs(a[1]-b[1])<=.20&&Math.abs(a[1]-b[1])/dxz(a,b)<=.72+1e-8&&
      connector.verify(a,b)&&connector.verify(b,a)&&
      certifyDirectedWalk(a,b,rule,connector)===null&&certifyDirectedWalk(b,a,rule,connector)===null;
    tested.set(key,ok);return ok;
  };
  type Pair={a:NavNode;b:NavNode;forward:boolean;reverse:boolean;span:number};
  const pairs:Pair[]=[];const seen=new Set<string>();
  for(const a of candidates)for(const e of graph.outgoing[a.id]??[]){
    if(e.mode!=='walk'||!byId.has(e.to))continue;
    const b=graph.nodes[e.to];const key=[a.id,b.id].sort().join('|');
    if(seen.has(key))continue;seen.add(key);
    const span=dxz(a.position,b.position);
    if(span<.13||span>.60)continue;
    const f=certifyDirectedWalk(a.position,b.position,rule,connector)===null;
    const r=certifyDirectedWalk(b.position,a.position,rule,connector)===null;
    if(f&&r)continue;
    pairs.push({a,b,forward:f,reverse:r,span});
  }
  pairs.sort((a,b)=>Number(b.forward!==b.reverse)-Number(a.forward!==a.reverse)||
    a.span-b.span||a.a.id.localeCompare(b.a.id));
  const additions:NavNode[]=[];const outgoing:NavigationGraph['outgoing']={};
  for(const [key,edges] of Object.entries(graph.outgoing))outgoing[key]=[...edges];
  let repaired=0,attempted=0;const errors: string[]=[];
  const patterns=[0,.035,-.035,.07,-.07,.105,-.105,.14,-.14];
  for(const pair of pairs.slice(0,12)){
    const {a,b,span}=pair;attempted++;
    const perp:[number,number]=[-(b.position[2]-a.position[2])/span,
      (b.position[0]-a.position[0])/span];
    let accepted:SpatialPoint[]|null=null;
    for(const off of patterns){
      const interior:SpatialPoint[]=[];
      const steps=Math.max(3,Math.ceil(span/.07));
      for(let j=1;j<steps;j++){
        const t=j/steps,center:SpatialPoint=[
          a.position[0]+(b.position[0]-a.position[0])*t+perp[0]*off*Math.sin(Math.PI*t),
          a.position[1]+(b.position[1]-a.position[1])*t,
          a.position[2]+(b.position[2]-a.position[2])*t+perp[1]*off*Math.sin(Math.PI*t),
        ];
        const hit=connector.project(center);
        if(!hit||dist(hit,center)>.20||!paintId(hit)||!isPmoPaintAuthorized(marks,hit)){
          interior.length=0;break;
        }
        interior.push(hit);
      }
      if(interior.length!==steps-1)continue;
      const sequence=[a.position,...interior,b.position];
      if(sequence.slice(1).every((p,k)=>safe(sequence[k],p))){accepted=interior;break;}
    }
    if(!accepted){if(errors.length<4)errors.push(a.id+'->'+b.id);continue;}
    const source=paintId(accepted[0])!;
    let prev=a.id;
    for(const p of accepted){
      const id='walk:pmo-site5-refine:'+additions.length;
      const n:NavNode={id,role:'walk',sourceId:paintId(p)??source,position:copy(p)};
      additions.push(n);outgoing[id]=[];
      const length=dist(graph.nodes[prev]?.position??additions.find(n=>n.id===prev)!.position,p);
      outgoing[prev].push({to:id,cost:length,mode:'walk',sourceId:n.sourceId});
      outgoing[id].push({to:prev,cost:length,mode:'walk',sourceId:n.sourceId});
      prev=id;
    }
    const p=additions[additions.length-1].position;
    const length=dist(p,b.position);
    outgoing[prev].push({to:b.id,cost:length,mode:'walk',sourceId:source});
    outgoing[b.id].push({to:prev,cost:length,mode:'walk',sourceId:source});
    repaired++;
  }
  if(!repaired)return unchanged('NO_CERTIFIED_DETOUR',`pairs=${pairs.length}:tried=${attempted}:first=${errors.join(',')}`);
  const nodes={...graph.nodes};for(const n of additions)nodes[n.id]=n;
  return {graph:{...graph,nodes,outgoing},repairedPairs:repaired,newNodes:additions.length,
    diagnostics:[`PMO_SITE5_REVERSE_EXIT_PHYSICAL_DETOUR:pairs=${repaired}:nodes=${additions.length}:evaluated=${attempted}:untreated=${pairs.length-attempted}`]};
}
