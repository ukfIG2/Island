/** DEV-only service-load decision policy. Core economy is not mutated. */
export type CrowdChoice='wait'|'switch'|'wander';
const unit=(id:string,salt:number)=>{let x=2166136261^salt;for(let i=0;i<id.length;i++){x=Math.imul(x^id.charCodeAt(i),16777619);}return (x>>>0)/4294967296;};
export function chooseCrowdResponse(id:string,queued:number,serviceSlots:number,secondsSinceReview:number):CrowdChoice{
  if(queued<=serviceSlots||secondsSinceReview<3)return 'wait';
  const saturation=Math.max(0,queued-serviceSlots)/Math.max(1,serviceSlots);
  const pressure=Math.min(.9,saturation/(saturation+3));
  const sample=unit(id,Math.floor(secondsSinceReview/6));
  if(sample<pressure*.62)return 'switch';
  if(sample<pressure)return 'wander';
  return 'wait';
}
/** Physical crowd DEMO dwell time, not the game Core service economy.
 * 0.7s caused queues to disappear before guests could visibly diffuse. */
export const CROWD_DEV_SERVICE_SECONDS=10;
/** One common bounded queueing model for the test's five service targets. */
export class CrowdServiceSlots{
  private readonly queues=new Map<number,string[]>();
  private readonly serving=new Map<number,Map<string,number>>();
  private readonly away=new Set<string>();
  constructor(readonly parallel=3,readonly serviceSeconds=.8){
    if(!Number.isInteger(parallel)||parallel<1||!Number.isFinite(serviceSeconds)||serviceSeconds<=0)throw Error('CROWD_SERVICE_INVALID_SETTINGS');
  }
  enqueue(site:number,id:string):void{
    const q=this.queues.get(site)??[];
    if(!q.includes(id)&&!this.serving.get(site)?.has(id)){q.push(id);this.queues.set(site,q);}
  }
  /** Keep FIFO identity while the visitor is physically away. Only present
   * visitors can start service; unavailable heads never block the entire site.
   */
  setReady(id:string,ready:boolean):boolean{
    if(![...this.queues.values()].some(q=>q.includes(id)))return false;
    if(ready)this.away.delete(id);else this.away.add(id);
    return true;
  }
  /** Number of physically serving guests plus FIFO tickets ahead of this ID.
   * Returns -1 after service has begun or if the ID is not queued. */
  ahead(site:number,id:string):number{
    const index=(this.queues.get(site)??[]).indexOf(id);
    return index<0?-1:index+(this.serving.get(site)?.size??0);
  }
  pressure(site:number):number{return (this.queues.get(site)?.length??0)+(this.serving.get(site)?.size??0);}
  pending():number{return [...this.queues.values()].reduce((sum,q)=>sum+q.length,0);}
  active():number{return [...this.serving.values()].reduce((sum,m)=>sum+m.size,0);}
  tick(dt:number):string[]{
    const finished:string[]=[];
    for(const [site,q] of this.queues){
      const m=this.serving.get(site)??new Map<string,number>();
      this.serving.set(site,m);
      while(m.size<this.parallel&&q.length){
        const next=q.findIndex(id=>!this.away.has(id));
        if(next<0)break;
        const id=q.splice(next,1)[0];this.away.delete(id);
        m.set(id,this.serviceSeconds);
      }
    }
    for(const m of this.serving.values())for(const [id,left] of m){
      if(left-dt<=1e-8){m.delete(id);finished.push(id);}else m.set(id,left-dt);
    }
    return finished;
  }
  status(id:string):'queued'|'servicing'|null{
    for(const q of this.queues.values())if(q.includes(id))return 'queued';
    for(const m of this.serving.values())if(m.has(id))return 'servicing';
    return null;
  }
  forget(id:string):void{this.away.delete(id);for(const q of this.queues.values()){const i=q.indexOf(id);if(i>=0)q.splice(i,1);}for(const m of this.serving.values())m.delete(id);}
}
