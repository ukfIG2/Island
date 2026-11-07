/** Physical guest motion: physically certified, low-frequency PERSONAL lanes inside PMO paint.
 * Routes remain anchored at every helper's authored entry/exit.  If paint/terrain
 * has no room, the ORIGINAL route is preserved and the rejection is measured.
 */
import type {BrushGraph,PmoTerrainConnector,RouteResult,RouteStep,SpatialPoint} from './pmoBrushCorridors';
const xz=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const d3=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const hash=(id:string,salt:number)=>{let h=2166136261^salt;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return (h^(h>>>13))>>>0;};
export interface RouteVariationStats {
  attempted:number;accepted:number;largest:number;mean:number;
  rejected:number;routes:number;variedRoutes:number;walkMeters:number;variedMeters:number;
}
type MutableStep=Omit<RouteStep,'from'|'to'> & {from:SpatialPoint;to:SpatialPoint};
const insidePaint=(p:SpatialPoint,graph:BrushGraph)=>!graph.stamps.length||graph.stamps.some(s=>
  xz(p,s.center)<=s.radius+1e-6&&Math.abs(p[1]-s.center[1])<=graph.rules.paintHeightTolerance);
export class CrowdRouteVariation {
  readonly stats:RouteVariationStats={attempted:0,accepted:0,largest:0,mean:0,rejected:0,
    routes:0,variedRoutes:0,walkMeters:0,variedMeters:0};
  constructor(private readonly graph:BrushGraph,private readonly connector:PmoTerrainConnector,
    private readonly certify:(a:SpatialPoint,b:SpatialPoint)=>boolean,
    readonly openMeters=.52,readonly structureFraction=.5){
    if(!(openMeters>0&&openMeters<=.75&&structureFraction>0&&structureFraction<=1))throw Error('CROWD_ROUTE_JITTER_INVALID');
  }
  apply(id:string,route:RouteResult):RouteResult {
    this.stats.routes++;
    if(route.status!=='READY'||route.steps.length<3)return route;
    const original=route.steps;
    const steps:MutableStep[]=original.map(s=>({...s,from:[...s.from],to:[...s.to]}));
    let changed=false;
    for(let start=0;start<steps.length;){
      if(steps[start].kind!=='walk'){start++;continue;}
      let end=start;
      while(end<steps.length&&steps[end].kind==='walk')end++;
      const length=steps.slice(start,end).reduce((v,s)=>v+d3(s.from,s.to),0);
      this.stats.walkMeters+=length;
      if(end-start>=3&&length>.36&&this.personalize(id,steps,original,start,end,length)){
        this.stats.variedMeters+=length;
        changed=true;
      }
      start=end;
    }
    if(!changed)return route;
    this.stats.variedRoutes++;
    return {...route,steps,points:[...steps.map(s=>[...s.from] as SpatialPoint),[...steps.at(-1)!.to]],
      distance:steps.reduce((n,s)=>n+d3(s.from,s.to),0)};
  }
  /** Elastic personal lane: the compiled shortest route is a GUIDE, not an
   * immutable rail. We relax each waypoint separately inside AUTHORED PMO
   * paint, then resolve any failing physical links by local attenuation.
   * Narrow seams don't force the entire walk run back onto the original rail.
   */
  private personalize(id:string,steps:MutableStep[],original:readonly RouteStep[],start:number,end:number,length:number):boolean {
    const count=end-start;
    const base:SpatialPoint[]=[...original.slice(start,end).map(s=>[...s.from] as SpatialPoint),
      [...original[end-1].to]];
    const distances=[0];
    for(let j=0;j<count;j++)distances.push(distances[j]+d3(base[j],base[j+1]));
    const key=hash(id,start*271+193),sign=key&1?1:-1;
    // V1.5.2: 2x requested lateral separation on OPEN PMO paint only.
    // Actual offset still attenuates at cliffs, tight stamps and helper ports.
    const targetAmplitude=Math.min(this.openMeters*2,Math.max(.32,length*.36));
    const projected=(candidate:SpatialPoint,reference:SpatialPoint):SpatialPoint|null=>{
      const p=this.connector.project(candidate);
      return p&&p.every(Number.isFinite)&&xz(p,candidate)<.025&&
        Math.abs(p[1]-reference[1])<.11&&insidePaint(p,this.graph)?p:null;
    };
    const positions=base.map(p=>[...p] as SpatialPoint);
    for(let j=1;j<count;j++){
      const p=base[j];
      // Tangent over ~0.4-0.8 metres instead of the zigzag of adjacent grid edges.
      let left=j-1,right=j+1;
      while(left>0&&distances[j]-distances[left]<.42)left--;
      while(right<count&&distances[right]-distances[j]<.42)right++;
      const dx=base[right][0]-base[left][0],dz=base[right][2]-base[left][2];
      const magnitude=Math.hypot(dx,dz);
      if(magnitude<.02)continue;
      // Hold a consistent lane through the walk and fan smoothly into the
      // EXACT authored helper port during the final ~0.50 m.
      // Double-width corridors demand a longer easing distance. Scaling the
      // lateral envelope with its requested displacement prevents sharp
      // S-bends at the first/last few 14 cm PMO graph nodes.
      const fadeMeters=Math.max(.80,targetAmplitude*1.60);
      const fade=Math.min(1,distances[j]/fadeMeters,(length-distances[j])/fadeMeters);
      const envelope=Math.sin(Math.PI*Math.max(0,fade)/2)**2;
      // One broad S-free lane throughout this uninterrupted walk segment.
      const desired=sign*targetAmplitude*envelope;
      let chosen:SpatialPoint|null=null;
      for(const fraction of [1,.82,.64,.48,.33,.20,.10]){
        const candidate:SpatialPoint=[p[0]-dz/magnitude*desired*fraction,p[1],
          p[2]+dx/magnitude*desired*fraction];
        const valid=projected(candidate,p);
        if(valid){chosen=valid;break;}
      }
      if(chosen)positions[j]=chosen;
    }
    this.stats.attempted++;
    // A short spatial convolution eliminates hard lateral corners caused by
    // neighboring stamps of unequal width. Every averaged point is recertified.
    const averaged=positions.map(p=>[...p] as SpatialPoint);
    for(let j=2;j<count-1;j++){
      const weights=[1,2,4,2,1],ids=[j-2,j-1,j,j+1,j+2];
      let x=0,z=0,weight=0;
      for(let k=0;k<5;k++){
        if(ids[k]<0||ids[k]>count)continue;
        x+=positions[ids[k]][0]*weights[k];z+=positions[ids[k]][2]*weights[k];weight+=weights[k];
      }
      const candidate:SpatialPoint=[.35*positions[j][0]+.65*x/weight,base[j][1],
        .35*positions[j][2]+.65*z/weight];
      const valid=projected(candidate,base[j]);
      if(valid)averaged[j]=valid;
    }
    for(let j=1;j<count;j++)positions[j]=averaged[j];
    const validLink=(a:SpatialPoint,b:SpatialPoint)=>{
      for(const t of [.2,.4,.6,.8]){
        const point:SpatialPoint=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,
          a[2]+(b[2]-a[2])*t];
        if(!insidePaint(point,this.graph))return false;
      }
      return this.certify(a,b);
    };
    // Attenuate only around unsafe edges, not the whole route. The ends
    // remain attached to the exact existing ports, including helper entries.
    for(let pass=0;pass<9;pass++){
      const faults:number[]=[];
      for(let j=0;j<count;j++)if(!validLink(positions[j],positions[j+1]))faults.push(j);
      if(!faults.length)break;
      const relax=new Set<number>();
      for(const i of faults)for(const j of [i-1,i,i+1,i+2])if(j>0&&j<count)relax.add(j);
      if(!relax.size){this.stats.rejected++;return false;}
      for(const j of relax){
        const candidate:SpatialPoint=[base[j][0]+(positions[j][0]-base[j][0])*.62,base[j][1],
          base[j][2]+(positions[j][2]-base[j][2])*.62];
        positions[j]=projected(candidate,base[j])??[...base[j]];
      }
      if(pass===8){this.stats.rejected++;return false;}
    }
    let moved=0,largest=0;
    for(let j=1;j<count;j++){
      const distance=xz(positions[j],base[j]);
      if(distance>.012){moved++;largest=Math.max(largest,distance);}
    }
    if(!moved){this.stats.rejected++;return false;}
    for(let j=0;j<count;j++){
      steps[start+j].from=[...positions[j]];steps[start+j].to=[...positions[j+1]];
    }
    this.stats.accepted+=moved;
    this.stats.largest=Math.max(this.stats.largest,largest);
    this.stats.mean+=(largest-this.stats.mean)/Math.max(1,this.stats.variedRoutes+1);
    return true;
  }
  speed(id:string):number{return +(0.23+(hash(id,335)%421)/1000).toFixed(3);}
}
