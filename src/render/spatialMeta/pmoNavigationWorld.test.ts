import { describe, expect, it } from 'vitest';
import authored from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
import { validateSpatialRegistry } from './registry';
import { readPmoWalkAuthorization } from './pmoWorldBindings';
import { buildPmoNavigationWorld, makePmoTerrainConnector } from './pmoNavigationWorld';

const fixture = () => validateSpatialRegistry(structuredClone(authored));

describe('PMO terrain-certified world navigation projection', () => {
  it('rejects unauthorized endpoints, missing terrain, and connector gaps', () => {
    const reg = fixture();
    reg.objects = reg.objects.filter(o => o.name === 'zone_pawns_can_move');
    const paint = reg.objects.find(o => o.name === 'zone_pawns_can_move')!;
    if (paint.geometry.type !== 'paint') throw Error('authored paint fixture absent');
    const first = paint.geometry.strokes[0];
    paint.geometry.strokes = [{ ...first, radius: 0.25, points: [[0,0,0], [1.4,0,0]] }];
    const terrain = { project: (x:number,z:number,y:number): [number,number,number] | null =>
      Number.isFinite(y) ? [x,0,z] : null };
    const guard = makePmoTerrainConnector(reg, terrain);
    expect(guard.project([0,0,0])).toEqual([0,0,0]);
    expect(guard.project([1.4,0,0])).toEqual([1.4,0,0]);
    expect(guard.project([0.7,0,0])).toBeNull();
    expect(guard.verify([0,0,0], [1.4,0,0])).toBe(false);
    expect(guard.verify([0,0,0], [0.1,0,0])).toBe(true);
  });

  it('does not fabricate motion when island terrain is absent', () => {
    const reg = fixture();
    const before = JSON.stringify(reg);
    const world = buildPmoNavigationWorld(reg, { project: () => null });
    expect(Object.keys(world.endpoints)).toHaveLength(0);
    expect(world.serviceRoute('reception','food').status).toBe('UNREACHABLE');
    expect(world.serviceRoute('reception','food').points).toEqual([]);
    expect(JSON.stringify(reg)).toBe(before);
  });

  it('keeps authored paint coordinates as the only walk authorization', () => {
    const reg = fixture();
    const stamp = readPmoWalkAuthorization(reg)[0];
    expect(stamp).toBeDefined();
    const terrain = {project: (x:number,z:number,y:number):[number,number,number] => [x,y,z]};
    const guard = makePmoTerrainConnector(reg,terrain);
    expect(guard.project(stamp.center)).toEqual(stamp.center);
    expect(guard.project([200,0,200])).toBeNull();
  });
});
