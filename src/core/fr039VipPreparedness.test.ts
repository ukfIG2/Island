import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, type BootstrapState, type BootstrapCommand } from './state';
import { deriveMvpVipPreviewInfo, MVP_VIP_PREVIEW_PROOF_CATALOG } from './vipPreview';
import { MVP_VIP_TYPES, MVP_VIP_PROVISIONAL_TIMING } from './vipLayer';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
const span = MVP_VIP_PROVISIONAL_TIMING.visitDurationMs;
describe('FR-039 prior-preparedness resolution independent of normal Worker allocation', () => {
  it.each(MVP_VIP_TYPES)('%s captures and persists unmet readiness independent of reassigned normal Workers', vipType => {
    const before = dispatch(createInitialBootstrapState('fr039-gaps-'+vipType, undefined, 'mvp'), { type: 'START_WAVE' });
    const info = deriveMvpVipPreviewInfo(before, vipType);
    const started = dispatch(before, { type: 'BEGIN_VIP_VISIT', vipType });
    const captured = { readiness: info.readiness, rosterGaps: info.rosterGaps, buildingGaps: info.buildingGaps };
    expect(started.vipLayer.active?.preparedness).toEqual(captured);
    expect(started.normalWave).toEqual(before.normalWave);
    const halfway = dispatch(started, { type: 'ADVANCE_SIMULATION', deltaMs: span / 2 });
    const restored = normalizePersistedState(JSON.parse(JSON.stringify(halfway)) as BootstrapState);
    expect(restored.vipLayer.active?.preparedness).toEqual(captured);
    const changedAllocation: BootstrapState = { ...restored, normalWave: { ...restored.normalWave, workerAssignments: { ...restored.normalWave.workerAssignments, 'worker-0': 'food' } } };
    expect(changedAllocation.vipLayer).toEqual(restored.vipLayer);
    const done = dispatch(changedAllocation, { type: 'ADVANCE_SIMULATION', deltaMs: span / 2 });
    const baselineDone = dispatch(restored, { type: 'ADVANCE_SIMULATION', deltaMs: span / 2 });
    expect(done.vipLayer.resolutions).toEqual(baselineDone.vipLayer.resolutions);
    expect(done.vipLayer.resolutions).toEqual([{ type: vipType, preparedness: captured }]);
    expect(done.vipLayer.completed).toEqual([vipType]);
    expect(normalizePersistedState(JSON.parse(JSON.stringify(done)) as BootstrapState).vipLayer.resolutions).toEqual(done.vipLayer.resolutions);
  });
  it.each(MVP_VIP_TYPES)('%s resolves prepared visits from existing investments, not subsequent staff changes', vipType => {
    const base = createInitialBootstrapState('fr039-ready-'+vipType, undefined, 'mvp');
    const profile = MVP_VIP_PREVIEW_PROOF_CATALOG[vipType];
    const prepared: BootstrapState = { ...base, vipBuildings: { ...base.vipBuildings, spa: profile.vipBuildings.includes('spa') }, hiredSpecialists: [...profile.specialists], purchasedAreas: { ...base.purchasedAreas, ...Object.fromEntries(profile.areas.map(id => [id, true])) }, normalWave: { ...base.normalWave, hiredManagers: { ...base.normalWave.hiredManagers, ...Object.fromEntries(profile.managers.map(id => [id, true])) } } };
    const started = dispatch(prepared, { type: 'BEGIN_VIP_VISIT', vipType });
    expect(started.vipLayer.active?.preparedness).toEqual({ readiness: 'prepared', rosterGaps: [], buildingGaps: [] });
    const stripped = { ...started, hiredSpecialists: [], purchasedAreas: { pool: false, bungalows: false }, normalWave: { ...started.normalWave, hiredManagers: {}, workerAssignments: {} } } as BootstrapState;
    const done = dispatch(stripped, { type: 'ADVANCE_SIMULATION', deltaMs: span });
    expect(done.vipLayer.resolutions).toEqual([{ type: vipType, preparedness: { readiness: 'prepared', rosterGaps: [], buildingGaps: [] } }]);
  });
  it('does not invent readiness or resolved outcome for legacy active VIP saves without a snapshot', () => {
    const started = dispatch(createInitialBootstrapState('fr039-legacy', undefined, 'mvp'), { type: 'BEGIN_VIP_VISIT', vipType: 'investor' });
    const legacy = JSON.parse(JSON.stringify(started));
    delete legacy.vipLayer.active.preparedness;
    delete legacy.vipLayer.resolutions;
    const restored = normalizePersistedState(legacy as BootstrapState);
    expect(restored.vipLayer.active?.preparedness).toBeUndefined();
    const done = dispatch(restored, { type: 'ADVANCE_SIMULATION', deltaMs: span });
    expect(done.vipLayer.completed).toEqual(['investor']);
    expect(done.vipLayer.resolutions).toEqual([]);
  });
  it('does not permit VIP targets in the normal Worker Allocation command type', () => {
    // @ts-expect-error VIP requests cannot be a NormalWaveNeedId target
    const forbidden: BootstrapCommand = { type: 'REASSIGN_WORKER', workerId: 'worker-0', to: 'vip' };
    expect(forbidden.type).toBe('REASSIGN_WORKER');
    expect(() => dispatch(createInitialBootstrapState('fr039-invalid-target', undefined, 'mvp'), forbidden)).toThrow('NORMAL_WAVE_TARGET_INACTIVE');
  });
});
