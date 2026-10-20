import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, type BootstrapState } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
import { initialMvpVipLayer } from './vipLayer';
import { MVP_VIP_PROVISIONAL_TIMING } from './vipLayer';
describe('FR-036 VIP state hydration and existing save compatibility', () => {
  it('preserves active VIP progress without replacing existing wave state', () => {
    const initial = createInitialBootstrapState('fr036-save', undefined, 'mvp');
    const started = applyBootstrapCommand(applyBootstrapCommand(initial, { type: 'START_WAVE' }), { type: 'BEGIN_VIP_VISIT', vipType: 'weddingCouple' });
    const midway = applyBootstrapCommand(started, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs / 2 });
    const restored = normalizePersistedState(JSON.parse(JSON.stringify(midway)) as BootstrapState);
    expect(restored.vipLayer).toEqual(midway.vipLayer);
    expect(restored.normalWave).toEqual(midway.normalWave);
    expect(restored.energy).toBe(midway.energy);
    expect(restored.coins).toBe(midway.coins);
    const resumed = applyBootstrapCommand(restored, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs / 2 });
    expect(resumed.vipLayer.completed).toEqual(['weddingCouple']);
    expect(resumed.normalWave.waveElapsedMs).toBeGreaterThan(restored.normalWave.waveElapsedMs);
  });
  it('hydrates an older VIP-free save without losing normal-wave progress', () => {
    const old = applyBootstrapCommand(applyBootstrapCommand(createInitialBootstrapState('fr036-old-save', undefined, 'mvp'), { type: 'START_WAVE' }), { type: 'ADVANCE_SIMULATION', deltaMs: 9000 });
    const raw = JSON.parse(JSON.stringify(old)) as Record<string, unknown>;
    delete raw.vipLayer;
    const result = normalizePersistedState(raw as unknown as BootstrapState);
    expect(result.vipLayer).toEqual(initialMvpVipLayer());
    expect(result.normalWave).toEqual(old.normalWave);
    expect(result.simulationTick).toBe(old.simulationTick);
    expect(result.progressionStage).toBe('mvp');
  });
});
