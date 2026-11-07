import {describe,expect,it} from 'vitest';
import {PmoOccupancyGrid,type PmoOccupant} from './pmoOccupancyGrid';
interface Occupant extends PmoOccupant {id:number;position:[number,number,number];status:string}
const oldRule=(all:readonly Occupant[],self:Occupant,next:readonly [number,number,number],spacing:number)=>
  all.some(a=>a!==self&&a.status!=='blocked'&&a.status!=='arrived'&&
    Math.hypot(a.position[0]-next[0],a.position[2]-next[2])<spacing&&
    Math.abs(a.position[1]-next[1])<0.19);
const pseudoRandom=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
describe('PMO occupancy broad-phase matches legacy exact narrow-phase',()=>{
  it('matches 5000 old-rule queries across negative coordinates, height layers and status',()=>{
    const rand=pseudoRandom(4291),spacing=0.078;
    const guests:Occupant[]=Array.from({length:100},(_,id)=>({id,
      status:id%19===0?'blocked':id%23===0?'arrived':'walking',
      position:[(rand()-.5)*4,(id%3)*0.21,(rand()-.5)*4]}));
    const grid=new PmoOccupancyGrid<Occupant>(spacing);grid.rebuild(guests);
    for(let i=0;i<5000;i++){
      const self=guests[Math.floor(rand()*guests.length)];
      const around=guests[Math.floor(rand()*guests.length)].position;
      const next:[number,number,number]=[around[0]+(rand()-.5)*.3,around[1]+(rand()-.5)*.4,around[2]+(rand()-.5)*.3];
      expect(grid.occupied(self,next)).toBe(oldRule(guests,self,next,spacing));
    }
  });
  it('updates positions and removes completed actors between sequential actor turns',()=>{
    const a:Occupant={id:1,status:'walking',position:[-0.1,0,0]};
    const b:Occupant={id:2,status:'walking',position:[0,0,0]};
    const c:Occupant={id:3,status:'walking',position:[0,0.22,0]};
    const all=[a,b,c],grid=new PmoOccupancyGrid<Occupant>(.08);grid.rebuild(all);
    expect(grid.occupied(a,[-0.03,0,0])).toBe(true);
    b.position=[0.4,0,0];grid.sync(b);
    expect(grid.occupied(a,[-0.03,0,0])).toBe(false);
    expect(grid.occupied(a,[0.4,0,0])).toBe(true);
    b.status='arrived';grid.sync(b);
    expect(grid.occupied(a,[0.4,0,0])).toBe(false);
    expect(grid.occupied(a,[0,0.22,0])).toBe(true);
    grid.rebuild(all);
    expect(grid.occupied(a,[-0.03,0,0])).toBe(false);
  });
});
