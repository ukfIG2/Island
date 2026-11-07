import authoredFixture from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
import { describe, expect, it } from 'vitest';
import type { SpatialRegistry } from './registry';
import { annotateAuthoredPmoTransitions } from './pmoAuthoredTransitions';

const authored = (): SpatialRegistry => structuredClone(authoredFixture) as unknown as SpatialRegistry;
const types = (registry: SpatialRegistry) => registry.objects.filter(o => o.geometry.type === 'skeleton')
  .map(o => (o.metadata.navigation as Record<string, unknown> | undefined)?.transition).filter(Boolean);

describe('authored PMO transition interpretation', () => {
  it('types exactly the six unchanged authored connectors without mutating the 37-object source', () => {
    const registry = authored();
    const before = JSON.stringify(registry);
    const interpreted = annotateAuthoredPmoTransitions(registry);
    expect(interpreted).not.toBe(registry);
    expect(interpreted.objects).toHaveLength(37);
    expect(types(interpreted).sort()).toEqual(['bridge','bridge','lift','lift','stairs','stairs']);
    expect(JSON.stringify(registry)).toBe(before);
    expect(types(registry)).toHaveLength(0);
    expect(annotateAuthoredPmoTransitions(interpreted)).toBe(interpreted);
    expect(interpreted.objects.filter(o => o.geometry.type === 'paint'))
      .toEqual(registry.objects.filter(o => o.geometry.type === 'paint'));
  });
  it('fails closed if authored identity or geometry changes', () => {
    const registry = authored();
    const target = registry.objects.find(o => o.id === 'pmo-2d1f3e6f-85ee-4abd-96fe-fd42943edcd4');
    expect(target).toBeDefined();
    if (!target || target.geometry.type !== 'skeleton') throw Error('Missing authored lift');
    target.name = 'edited lift';
    expect(types(annotateAuthoredPmoTransitions(registry))).toHaveLength(5);
  });
  it('does not type a connector when an authored edge identity was edited', () => {
    const registry = authored();
    const target = registry.objects.find(o => o.id === 'pmo-2d1f3e6f-85ee-4abd-96fe-fd42943edcd4');
    if (!target || target.geometry.type !== 'skeleton') throw Error('Missing authored lift');
    target.geometry.edges[0].from = 'modified-point-identity';
    const interpreted = annotateAuthoredPmoTransitions(registry);
    expect(types(interpreted)).toHaveLength(5);
    expect(interpreted.objects.find(o => o.id === target.id)).toBe(target);
  });
  it('never overrides an explicit user-authored transition', () => {
    const registry = authored();
    const target = registry.objects.find(o => o.id === 'pmo-2d1f3e6f-85ee-4abd-96fe-fd42943edcd4');
    if (!target) throw Error('Missing authored lift');
    target.metadata.navigation = { transition: 'bridge', authored: true };
    const interpreted = annotateAuthoredPmoTransitions(registry);
    const result = interpreted.objects.find(o => o.id === target.id);
    expect(result?.metadata.navigation).toEqual({ transition: 'bridge', authored: true });
    expect(types(interpreted)).toHaveLength(6);
  });
});
