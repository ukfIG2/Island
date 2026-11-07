/** Repair only an evidenced one-way site-5 exit cut, never a nearby random seam.
 * Target: after motor filtering, an upper walk node must reach the lower side
 * of the authored 4<->5 stair. New links stay on terrain/paint and are certified
 * by the exact 6mm pedestrian walk gate in both directions. Fail closed.
 */
import type {NavigationGraph,NavNode,NavEdge} from './navigation';
import type {SpatialPoint} from './registry';
import type {PmoTerrainConnector} from './pmoBrushCorridors';
import type {PmoStructure} from './pmoTransitionStructures';
import {certifyDirectedWalk} from './pmoWalkKinematics';

const rules={rules:{step:.18,maxWalkLink:.32,maxGrade:.72,maxStepY:.20,paintHeightTolerance:.52}};
const copy=(p:SpatialPoint):SpatialPoint=>[...p];
const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const horizontal=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const rounded=(p:SpatialPoint)=>p.map(n=>n.toFixed(6)).join(',');
export interface Site5CutRepair {graph:NavigationGraph;diagnostics:string[];newNodes:number;reconnected:boolean;}
export function repairSite5DirectedCut(graph:NavigationGraph,structures:readonly PmoStructure[],connector:PmoTerrainConnector):Site5CutRepair{
  const fail=(reason:string,extra=''):Site5CutRepair=>({graph,diagnostics:[`PMO_SITE5_CUT_${reason}${extra?':'+extra:''}`],newNodes:0,reconnected:false});
  const stair=structures.find(s=>s.kind==='stairs'&&s.from[1]<-.85&&s.to[1]>-.75&&
    s.from[0]>2.55&&s.from[0]<2.85&&s.to[0]>3.25&&s.to[0]<3.50);
  if(!stair)return fail('NO_AUTHORED_STAIR');
  const walks=Object.values(graph.nodes).filter(n=>n.role==='walk');
  const nearest=(p:SpatialPoint)=>walks.filter(n=>dist(n.position,p)<.38)
    .sort((a,b)=>dist(a.position,p)-dist(b.position,p)||a.id.localeCompare(b.id))[0];
  const bottom=nearest(stair.from),top=nearest(stair.to);
  if(!bottom||!top)return fail('MISSING_PORT_WALK');
  const allowedCache=new Map<string,boolean>();
  const motion=(a:SpatialPoint,b:SpatialPoint):boolean=>{
    const key=rounded(a)+'|'+rounded(b);
    if(allowedCache.has(key))return allowedCache.get(key)!;
    const span=horizontal(a,b),dy=Math.abs(a[1]-b[1]);
    let ok=false;
    if(dist(a,b)<.0005){
      try{ok=connector.verify(a,b)===true&&connector.verify(b,a)===true;}catch{ok=false;}
    }else if(span>1e-7 && dy<=.2+1e-8 && dy/span<=.72+1e-8){
      try{ok=connector.verify(a,b)===true&&connector.verify(b,a)===true&&
        certifyDirectedWalk(a,b,rules,connector)===null;}catch{ok=false;}
    }
    allowedCache.set(key,ok);return ok;
  };
  // Modeled exactly after adapter -> motion audit: each authored walk edge
  // survives only with both connector checks and a directed 6mm motor pass.
  const adj=new Map<string,string[]>(),reverse=new Map<string,string[]>();
  for(const id of Object.keys(graph.nodes)){adj.set(id,[]);reverse.set(id,[]);}
  for(const [id,edges] of Object.entries(graph.outgoing)){
    const start=graph.nodes[id];if(!start)continue;
    for(const edge of edges){
      const goal=graph.nodes[edge.to];if(!goal)continue;
      if(edge.mode==='walk'&&!motion(start.position,goal.position))continue;
      adj.get(id)!.push(edge.to);reverse.get(edge.to)!.push(id);
    }
  }
  const reach=(from:string,edges:Map<string,string[]>)=>{
    const visited=new Set<string>([from]),queue=[from];
    for(let i=0;i<queue.length;i++)for(const next of edges.get(queue[i])??[])
      if(!visited.has(next)){visited.add(next);queue.push(next);}
    return visited;
  };
  const upperReach=reach(top.id,adj),lowerCanReach=reach(bottom.id,reverse);
  if(upperReach.has(bottom.id))return fail('ALREADY_MOTOR_CONNECTED',`upper=${upperReach.size}`);
  if(!reach(bottom.id,adj).has(top.id))return fail('STAIR_FORWARD_NOT_MOTOR_CONNECTED');
  // The effective cut may have NO original walk edge: the compiler/adaptor can
  // drop an unusable direction entirely. Search the actual reachable sets,
  // including the walk bank extending toward site 5, not graph.outgoing edges.
  // A connector is admitted ONLY if it bridges upperReach -> lowerCanReach,
  // uses approved terrain/paint, passes the production motor in both directions,
  // and witnesses a top->bottom route in the effective graph.
  type Cut={upper:NavNode;lower:NavNode;d:number;region:number};
  const candidates:Cut[]=[];
  const nearCorridor=(p:SpatialPoint)=>
    (horizontal(p,stair.to)<1.35&&Math.abs(p[1]-stair.to[1])<.38)||
    (p[0]>=3.12&&p[0]<=4.18&&p[2]>=-.63&&p[2]<=.96&&p[1]>=-.79&&p[1]<=-.25);
  const upperNodes=walks.filter(n=>upperReach.has(n.id)&&nearCorridor(n.position));
  // Lower-side frontier may include the stair portal: a physical edge from
  // an upper-side walk node to that portal is legal only when motor-certified.
  const lowerNodes=Object.values(graph.nodes).filter(n=>lowerCanReach.has(n.id)&&
    ['walk','portal'].includes(n.role)&&nearCorridor(n.position));
  let nearestGap=Infinity;let spatialPairs=0;
  for(const upper of upperNodes)for(const lower of lowerNodes){
    if(upper.id===lower.id||upperReach.has(lower.id))continue;
    const d=horizontal(upper.position,lower.position);
    if(d<nearestGap)nearestGap=d;
    if(d<.002||d>.62||Math.abs(upper.position[1]-lower.position[1])>.25)continue;
    const region=Math.min(horizontal(upper.position,stair.to),horizontal(lower.position,stair.to));
    candidates.push({upper,lower,d,region});spatialPairs++;
  }
  // Candidates near the authored upper portal are preferred; the remaining
  // bank toward building_5 is searched if no portal solution certifies.
  candidates.sort((a,b)=>a.region-b.region||a.d-b.d||a.upper.id.localeCompare(b.upper.id)||a.lower.id.localeCompare(b.lower.id));
  if(!candidates.length)return fail('NO_SPATIAL_CUT_PAIR',
    `upper=${upperReach.size}:lower=${lowerCanReach.size}:nearUpper=${upperNodes.length}:nearLower=${lowerNodes.length}:closest=${Number.isFinite(nearestGap)?nearestGap.toFixed(3):'none'}`);
  const samplesOffsets=[0,.018,-.018,.04,-.04,.075,-.075,.12,-.12,.18,-.18,.25,-.25];
  const attempts:string[]=[];
  let accepted:SpatialPoint[]|null=null,selected:Cut|null=null,verified=0;
  // Bound work: 240 spatial candidates, 13 lateral patterns, max 12 intermediate
  // points. No scans of unrelated island branches and no recursion.
  for(const cut of candidates.slice(0,240)){
    const a=cut.upper.position,b=cut.lower.position;
    const perp:[number,number]=[-(b[2]-a[2])/cut.d,(b[0]-a[0])/cut.d];
    for(const offset of samplesOffsets){
      const count=Math.max(2,Math.min(13,Math.ceil(cut.d/.052)));
      const path:SpatialPoint[]=[a];let valid=true;
      for(let k=1;k<count;k++){
        const t=k/count;
        const tentative:SpatialPoint=[a[0]+(b[0]-a[0])*t+perp[0]*offset*Math.sin(Math.PI*t),
          a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t+perp[1]*offset*Math.sin(Math.PI*t)];
        let p:SpatialPoint|null=null;try{p=connector.project(tentative);}catch{}
        if(!p||dist(p,tentative)>.19){valid=false;break;}
        path.push(p);
      }
      if(!valid)continue;
      path.push(b);verified++;
      if(path.slice(1).every((p,k)=>motion(path[k],p)&&motion(p,path[k]))){accepted=path;selected=cut;break;}
    }
    if(accepted)break;
    if(attempts.length<4)attempts.push(`${cut.upper.id}->${cut.lower.id}@${rounded(a)}>${rounded(b)}`);
  }
  if(!accepted||!selected)return fail('NO_CERTIFIED_CUT_CROSSING',
    `pairs=${spatialPairs}:tried=${Math.min(240,candidates.length)}:verified=${verified}:first=${attempts.join(';')}`);
  const outgoing:NavigationGraph['outgoing']={};for(const [id,edges]of Object.entries(graph.outgoing))outgoing[id]=[...edges];
  const nodes={...graph.nodes};let last=selected.upper.id;
  for(let i=1;i<accepted.length-1;i++){
    const id='walk:pmo-site5-cut:v3:'+i;
    if(nodes[id])return fail('NODE_COLLISION',id);
    nodes[id]={id,role:'walk',sourceId:selected.upper.sourceId,position:copy(accepted[i])};outgoing[id]=[];
    const previous=nodes[last].position,cost=dist(previous,accepted[i]);
    outgoing[last].push({to:id,cost,mode:'walk',sourceId:'pmo-compiled:site5-motor-cut'});
    outgoing[id].push({to:last,cost,mode:'walk',sourceId:'pmo-compiled:site5-motor-cut'});
    last=id;
  }
  const dest=selected.lower.id,cost=dist(nodes[last].position,nodes[dest].position);
  outgoing[last].push({to:dest,cost,mode:'walk',sourceId:'pmo-compiled:site5-motor-cut'});
  outgoing[dest].push({to:last,cost,mode:'walk',sourceId:'pmo-compiled:site5-motor-cut'});
  // Witness: added links must ACTUALLY cross the previously detected directed
  // connectivity cut; all legs were physically certified both ways above.
  const motorWitness=new Map<string,string[]>();
  for(const [id,targets] of adj)motorWitness.set(id,[...targets]);
  const chain=[selected.upper.id,...accepted.slice(1,-1).map((_,i)=>'walk:pmo-site5-cut:v3:'+(i+1)),dest];
  for(let i=1;i<chain.length;i++){
    motorWitness.set(chain[i-1],[...(motorWitness.get(chain[i-1])??[]),chain[i]]);
    motorWitness.set(chain[i],[...(motorWitness.get(chain[i])??[]),chain[i-1]]);
  }
  if(!reach(top.id,motorWitness).has(bottom.id))return fail('PATCH_NOT_CONNECTING_CUT');
  const patched:NavigationGraph={...graph,nodes,outgoing};
  return {graph:patched,newNodes:accepted.length-2,reconnected:true,
    diagnostics:[`PMO_SITE5_CUT_V3_PHYSICAL_RECONNECTED:upper=${selected.upper.id}:lower=${dest}:newNodes=${accepted.length-2}:candidatePairs=${candidates.length}:upperReachBefore=${upperReach.size}`]};
}
