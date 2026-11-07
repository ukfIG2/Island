import { describe, expect, it } from 'vitest';
import authored from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
import { validateSpatialRegistry } from './registry';
import { GAMEPLAY_SITE_ASSIGNMENTS, resolvePmoServiceLayout } from './pmoServiceLayout';
import { readPmoWalkAuthorization } from './pmoWorldBindings';

describe('PMO distinct authored service entrances', () => {
 const registry = validateSpatialRegistry(authored);
 it('reserves a different physically authored walk position for each assigned service', () => {
   const original = JSON.stringify(registry);
   const result = resolvePmoServiceLayout(registry, GAMEPLAY_SITE_ASSIGNMENTS, 'authored-snapshot');
   const services = Object.entries(result.services).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => !!entry[1]);
   expect(result.errors).toEqual([]);
   expect(services).toHaveLength(Object.keys(GAMEPLAY_SITE_ASSIGNMENTS).length);
   expect(new Set(services.map(([, site]) => JSON.stringify(site.entrance))).size).toBe(services.length);
   const authoredStamps = readPmoWalkAuthorization(registry);
   for (const [, site] of services) {
     expect(authoredStamps.some(stamp => stamp.sourceId === site.sourceWalkPmoId && stamp.center.every((n, i) => n === site.entrance[i]))).toBe(true);
   }
   expect(JSON.stringify(registry)).toBe(original);
 });
 it('is deterministic across independent layout resolutions', () => {
   const a = resolvePmoServiceLayout(registry, GAMEPLAY_SITE_ASSIGNMENTS, 'authored-snapshot');
   const b = resolvePmoServiceLayout(registry, GAMEPLAY_SITE_ASSIGNMENTS, 'authored-snapshot');
   expect(a).toEqual(b);
   expect(a.services.reception?.entrance).not.toEqual(a.services.relax?.entrance);
 });
});
