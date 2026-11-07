import {describe,it,expect} from 'vitest';
import {PmoBottleneckDirector} from './pmoBottleneckDirector';
const make=()=>new PmoBottleneckDirector([
  {id:'beach',kind:'stairs',capacity:2,averageHoldSeconds:5},
  {id:'elevator',kind:'lift',capacity:1,averageHoldSeconds:9},
  {id:'cafe',kind:'service',capacity:1,averageHoldSeconds:4},
  {id:'boat',kind:'boarding',capacity:3,averageHoldSeconds:2},
]);
describe('universal PMO bottleneck admission',()=>{
  it('uses strict FIFO and never silently creates a physical actor or skips a waiter',()=>{
    const d=make();
    for(let n=1;n<=100;n++)d.enqueue('g'+n,'beach');
    expect(d.tryAcquire('g9','beach')).toBe(false);
    expect(d.tryAcquire('g1','beach')).toBe(true);
    expect(d.tryAcquire('g2','beach')).toBe(true);
    expect(d.tryAcquire('g3','beach')).toBe(false);
    d.release('g1','beach');
    expect(d.tryAcquire('g3','beach')).toBe(true);
    expect(d.view('beach').occupied).toBe(2);
    expect(d.view('beach').queued).toBe(97);
    d.cancel('g2');d.cancel('g3');
    expect(d.tryAcquire('g4','beach')).toBe(true);
  });
  it('one caller supports the same leased safety contract for lifts, services and boarding',()=>{
    const d=make();
    for(const id of ['elevator','cafe','boat']){
      d.enqueue('a',id);d.enqueue('b',id);
      expect(d.tryAcquire('a',id)).toBe(true);
      expect(d.tryAcquire('b',id)).toBe(id==='boat');
    }
    d.cancel('a');d.cancel('b');
    for(const id of ['elevator','cafe','boat'])expect(d.view(id).occupied).toBe(0);
  });
  it('retains queue priority if the physically attempted spawn is obstructed',()=>{
    const d=make();d.enqueue('a','beach');d.enqueue('b','beach');
    expect(d.tryAcquire('a','beach')).toBe(true);
    d.yieldUnlaunched('a','beach');
    expect(d.view('beach').firstWaiting).toBe('a');
    expect(d.tryAcquire('a','beach')).toBe(true);
  });
  it('gives stable delay-informed advice, preserving mandatory transport tasks',()=>{
    const d=make();for(let i=0;i<20;i++)d.enqueue('g'+i,'elevator');
    expect(d.advise('g19','elevator',{patienceSeconds:10,alternativePhysicalRoute:true,safeWanderArea:true,mandatory:false})).toBe('consider-replan');
    expect(d.advise('g19','elevator',{patienceSeconds:10,alternativePhysicalRoute:true,safeWanderArea:true,mandatory:true})).toBe('wait');
    expect(d.advise('g19','elevator',{patienceSeconds:10,alternativePhysicalRoute:false,safeWanderArea:true,mandatory:false})).toBe('consider-wander');
    expect(d.advise('g0','elevator',{patienceSeconds:40,alternativePhysicalRoute:true,safeWanderArea:true,mandatory:false})).toBe('wait');
    expect(d.view('elevator').estimatedQueueSeconds).toBeGreaterThan(60);
  });
});
