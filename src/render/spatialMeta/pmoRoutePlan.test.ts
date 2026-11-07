import {describe,expect,it} from 'vitest';
import type { NavigationGraph } from './navigation';
import {planPmoRoute} from './pmoRoutePlan';
import {validateSpatialRegistry} from './registry';
import authored from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';

const registry=validateSpatialRegistry(authored);
const source=registry.objects.find(o=>o.name==='zone_pawns_can_move')!;
if (source.geometry.type!=='paint') throw Error('fixture walk paint absent');
const [a,b,c]=source.geometry.strokes.flatMap(s=>s.points);
const clonePoint=(p:typeof a):typeof a=>[p[0],p[1],p[2]];
const graph=(connect=true,mode:'walk'|'bridge'='walk'):NavigationGraph=>({
  schemaVersion:1,issues:[],
  nodes:{a:{id:'a',position:clonePoint(a),sourceId:source.id,role:'walk'},b:{id:'b',position:clonePoint(b),sourceId:source.id,role:'walk'}},
  outgoing:{a:connect?[{to:'b',cost:1,mode,sourceId:source.id}]:[],b:connect?[{to:'a',cost:1,mode,sourceId:source.id}]:[]}
});

describe('PMO route evidence and fail closed boundaries',()=>{
  it('accepts exact authorized terrain-only graph endpoints',()=>{
    const g=graph();const r=planPmoRoute(registry,g,{start:a,goal:b,snapRadius:.02,certifiedTerrainGraph:g});
    expect(r.status).toBe('READY'); expect(r.confidence).toBe('terrain-walk');
    expect(r.terrainVerified).toBe(true);
  });
  it('cannot promote an uncertified injected graph to collision evidence',()=>{
    const r=planPmoRoute(registry,graph(),{start:a,goal:b,snapRadius:.02});
    expect(r.status).toBe('REVIEW_REQUIRED');expect(r.confidence).toBe('graph-unverified');
  });
  it('never interpolates directly across a disconnected graph',()=>{
    const r=planPmoRoute(registry,graph(false),{start:a,goal:b,snapRadius:.02});
    expect(r.status).toBe('UNREACHABLE'); expect(r.points).toEqual([]);
  });
  it('labels a bridge as not yet physically accepted',()=>{
    const g=graph(true,'bridge');const r=planPmoRoute(registry,g,{start:a,goal:b,snapRadius:.02,certifiedTerrainGraph:g});
    expect(r.status).toBe('REVIEW_REQUIRED');expect(r.confidence).toBe('authored-transition');
    expect(r.issues).toContain('SPECIAL_TRANSITION_NEEDS_3D_GEOMETRY_ACCEPTANCE');
  });
  it('selects a certified longer connector when the cheapest candidate connector is unsafe',()=>{
    const unsafe:[number,number,number]=[a[0]+.008,a[1],a[2]];
    const safe:[number,number,number]=[a[0]+.08,a[1],a[2]];
    const g:NavigationGraph={schemaVersion:1,issues:[],
      nodes:{bad:{id:'bad',position:unsafe,sourceId:source.id,role:'walk'},
        good:{id:'good',position:safe,sourceId:source.id,role:'walk'},
        goal:{id:'goal',position:clonePoint(b),sourceId:source.id,role:'walk'}},
      outgoing:{bad:[{to:'goal',cost:.01,mode:'walk',sourceId:source.id}],
        good:[{to:'goal',cost:.5,mode:'walk',sourceId:source.id}],goal:[]}};
    const connector=(_from:typeof a,to:typeof a)=>to[0]>=a[0]+.04;
    const r=planPmoRoute(registry,g,{start:a,goal:b,snapRadius:.15,
      certifiedTerrainGraph:g,verifyConnector:connector});
    expect(r.status).toBe('READY');expect(r.terrainVerified).toBe(true);
    expect(r.graphNodeIds[0]).toBe('good');expect(r.issues).toEqual([]);
    const denied=planPmoRoute(registry,g,{start:a,goal:b,snapRadius:.15,
      certifiedTerrainGraph:g,verifyConnector:()=>false});
    expect(denied.status).toBe('REVIEW_REQUIRED');
    expect(denied.issues).toContain('ENDPOINT_CONNECTOR_UNVERIFIED');
  });
  it('prefers a certified walking route over a cheaper unaudited bridge shortcut',()=>{
    const shortcut:[number,number,number]=[a[0]+.008,a[1],a[2]];
    const walking:[number,number,number]=[a[0]+.08,a[1],a[2]];
    const g:NavigationGraph={schemaVersion:1,issues:[],
      nodes:{shortcut:{id:'shortcut',position:shortcut,sourceId:source.id,role:'walk'},
        walking:{id:'walking',position:walking,sourceId:source.id,role:'walk'},
        goal:{id:'goal',position:clonePoint(b),sourceId:source.id,role:'walk'}},
      outgoing:{shortcut:[{to:'goal',cost:.01,mode:'bridge',sourceId:source.id}],
        walking:[{to:'goal',cost:.5,mode:'walk',sourceId:source.id}],goal:[]}};
    const r=planPmoRoute(registry,g,{start:a,goal:b,snapRadius:.15,
      certifiedTerrainGraph:g,verifyConnector:()=>true});
    expect(r.status).toBe('READY');
    expect(r.graphNodeIds[0]).toBe('walking');
    expect(r.traversedEdges.every(e=>e.mode==='walk')).toBe(true);
  });
  it('disallows a route that goes outside authorized walk paint',()=>{
    const far:typeof a=[200,0,200];
    const r=planPmoRoute(registry,graph(),{start:far,goal:b,snapRadius:.02});
    expect(r.status).toBe('UNAUTHORIZED_ENDPOINT');expect(r.points).toEqual([]);
  });
  it('keeps synthetic PMO nodes disabled unless explicitly previewed',()=>{
    const g=graph();delete g.nodes.b;g.nodes['authorized-stamp:preview']={id:'authorized-stamp:preview',position:clonePoint(b),sourceId:source.id,role:'walk'};
    g.outgoing.a=[{to:'authorized-stamp:preview',cost:1,mode:'walk',sourceId:source.id}];g.outgoing['authorized-stamp:preview']=[];
    expect(planPmoRoute(registry,g,{start:a,goal:b,snapRadius:.02}).status).toBe('UNREACHABLE');
    const preview=planPmoRoute(registry,g,{start:a,goal:b,snapRadius:.02,allowVirtual:true});
    expect(preview.status).toBe('REVIEW_REQUIRED');expect(preview.terrainVerified).toBe(false);
  });
});
