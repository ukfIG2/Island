import {describe,expect,it} from 'vitest';
import {readSeaBeachPmoStrokes} from './seaBeachPmoStrokes';
import type {SpatialRegistry} from './spatialMeta/registry';
const registry=(strokes:unknown[]):SpatialRegistry=>({schemaVersion:1,coordinateSpace:'world',objects:[{
  id:'p',name:'zone_main_beach_entries',geometry:{type:'paint',strokes:strokes as never},
  metadata:{},relations:[],visible:true,revision:1,
}]});
describe('Sea V4.1 authorial PMO bridge',()=>{
  it('retains black paint area and radius, not stroke centers only',()=>{
    const a=readSeaBeachPmoStrokes(registry([
      {id:'a',color:'#000000',radius:.51,points:[[1,-2,5]]},
      {id:'b',color:'#fffdc7',radius:.40,points:[[2,-2,5]]},
      {id:'c',color:'#000000',radius:.64,points:[[3,-2,5]]},
    ]));
    expect(a.map(s=>[s.id,s.radius])).toEqual([['a',.51],['c',.64]]);
    expect(a[0].points).toEqual([[1,-2,5]]);
  });
  it('never invents a missing beach paint object',()=>{
    expect(readSeaBeachPmoStrokes({schemaVersion:1,coordinateSpace:'world',objects:[]})).toEqual([]);
  });
});
