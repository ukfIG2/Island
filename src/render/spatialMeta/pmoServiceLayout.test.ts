import { describe, expect, it } from 'vitest';
import authored from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
import { validateSpatialRegistry } from './registry';
import { GAMEPLAY_SITE_ASSIGNMENTS, resolvePmoServiceLayout } from './pmoServiceLayout';
import { readPmoWalkAuthorization } from './pmoWorldBindings';

describe('PMO-governed game service site layout', () => {
  const registry = validateSpatialRegistry(authored);
  it('resolves all five services to authored building IDs and authorized approach points', () => {
    const r = resolvePmoServiceLayout(registry);
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.services)).toHaveLength(5);
    const walk = readPmoWalkAuthorization(registry);
    for (const [service, id] of Object.entries(GAMEPLAY_SITE_ASSIGNMENTS)) {
      const site = r.services[service as keyof typeof GAMEPLAY_SITE_ASSIGNMENTS]!;
      expect(site.pmoId).toBe(id);
      expect(site.center).toEqual(Object.values(registry.objects.find(o => o.id === id)!.geometry.type === 'skeleton' ?
        (registry.objects.find(o => o.id === id)!.geometry as {points: Record<string, [number, number, number]>}).points : {})[0]);
      expect(walk.some(s => s.sourceId === site.sourceWalkPmoId && s.center.every((v, i) => v === site.entrance[i]))).toBe(true);
    }
  });
  it('moves a service with its PMO ID rather than keeping its former location', () => {
    const copy = structuredClone(registry);
    const obj = copy.objects.find(o => o.id === GAMEPLAY_SITE_ASSIGNMENTS.reception)!;
    if (obj.geometry.type !== 'skeleton') throw Error('invalid test fixture');
    const key = Object.keys(obj.geometry.points)[0];
    obj.geometry.points[key] = [2.51, -0.9621, 3.10];
    expect(resolvePmoServiceLayout(copy).services.reception?.center).toEqual([2.51,-0.9621,3.10]);
  });
  it('fails closed on deleted PMO rather than substituting a nearest building', () => {
    const copy = structuredClone(registry);
    copy.objects = copy.objects.filter(o => o.id !== GAMEPLAY_SITE_ASSIGNMENTS.reception);
    const r = resolvePmoServiceLayout(copy);
    expect(r.services.reception).toBeUndefined();
    expect(r.errors.some(e => e.startsWith('reception:') && e.includes('MISSING_PMO'))).toBe(true);
  });
});
