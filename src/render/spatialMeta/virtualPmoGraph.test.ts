import {describe,it,expect} from 'vitest';
import authoredJson from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
import overlayJson from '../../../semantic/evidence/pmo/registry-generated-21.json';
import {validateSpatialRegistry} from './registry';
import {mergeGeneratedPmos} from './mergeGeneratedPmos';
import {mergeOperatorPmoNavigation,expandAuthorizedRoute} from './virtualPmoGraph';
import {routeNavigation} from './navigation';
const source=validateSpatialRegistry(authoredJson);
const overlay=validateSpatialRegistry(overlayJson);
const combined=validateSpatialRegistry({...source,objects:[...source.objects,...overlay.objects]});
describe('authorized PMO gap completion',()=>{
it('preserves originals, adds exactly 21 links and rejects edited origins',()=>{const first=mergeGeneratedPmos(source,source,combined);expect(first.added).toBe(21);expect(first.registry.objects.slice(0,37)).toEqual(source.objects);expect(mergeGeneratedPmos(first.registry,source,combined).added).toBe(0);const modified=structuredClone(source);modified.objects[0].name='changed';expect(()=>mergeGeneratedPmos(modified,source,combined)).toThrow(/differs/)});
it('preserves 111 authored stamps and reaches all 9 portals without inventing links to 5 isolated marks',()=>{
  const base={schemaVersion:1 as const,nodes:{},outgoing:{},issues:[]};
  const result=mergeOperatorPmoNavigation(base,combined);
  expect(result.virtualLinks).toBe(21);
  expect(result.missingEndpoints).toEqual([]);
  expect(result.entirelyTerrainProven).toBe(false);
  const ids=Object.keys(result.graph.nodes);
  const stamps=ids.filter(x=>x.startsWith('authorized-stamp:'));
  const buildings=ids.filter(x=>x.startsWith('authorized-portal:'));
  expect(stamps).toHaveLength(111);
  expect(buildings).toHaveLength(9);
  const reachable=ids.filter(id=>routeNavigation(result.graph,stamps[0],id).found);
  const isolated=ids.filter(id=>!routeNavigation(result.graph,stamps[0],id).found);
  expect(reachable).toHaveLength(115);
  expect(isolated).toHaveLength(5);
  expect(isolated.every(id=>id.startsWith('authorized-stamp:'))).toBe(true);
  for(const id of isolated){
    expect(result.graph.outgoing[id]).toHaveLength(0);
    expect(expandAuthorizedRoute(routeNavigation(result.graph,stamps[0],id),combined)).toEqual([]);
  }
  for(const id of buildings)expect(reachable).toContain(id);
  for(const id of reachable){
    const route=routeNavigation(result.graph,stamps[0],id);
    expect(expandAuthorizedRoute(route,combined).length).toBeGreaterThan(0);
  }
});
});
