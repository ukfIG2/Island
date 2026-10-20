import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveEnergyModeAvailable, normalWaveServiceCapacity, type BootstrapState } from './state';

function tick(state: BootstrapState, count = 1): BootstrapState {
  let current = state;
  for (let i = 0; i < count; i++) current = applyBootstrapCommand(current, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  return current;
}
function prepared(stage: BootstrapState['progressionStage']): BootstrapState {
  const initial = createInitialBootstrapState('fr032-' + stage, undefined, stage);
  return tick(applyBootstrapCommand({ ...initial, energy: 4 }, { type: 'START_WAVE' }), 35);
}
describe('FR-032 selected-building temporary Energy Mode', () => {
  for (const stage of ['prototype', 'mvp'] as const) {
    it(stage + ': boosts already active food service without changing capacity or other services', () => {
      const before = prepared(stage);
      expect(before.normalWave.serviceProgressByNeed.food.length).toBeGreaterThan(0);
      const capacity = normalWaveServiceCapacity(before, 'food');
      const comparison = tick(before);
      expect(normalWaveEnergyModeAvailable(before, 'food')).toBe(true);
      const activated = applyBootstrapCommand(before, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
      const boosted = tick(activated);
      expect(activated.energy).toBe(before.energy - 1);
      expect(boosted.normalWave.energyMode?.need).toBe('food');
      expect(normalWaveServiceCapacity(boosted, 'food')).toBe(capacity);
      expect(boosted.normalWave.serviceProgressByNeed.food[0]).toBeGreaterThan(comparison.normalWave.serviceProgressByNeed.food[0]);
      expect(boosted.normalWave.serviceProgressByNeed.reception).toEqual(comparison.normalWave.serviceProgressByNeed.reception);
    });
  }
  it('Prototype prevents repeat on an expired boosted building, including after serialization, but resets at the next wave', () => {
    const first = applyBootstrapCommand(prepared('prototype'), { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
    expect(first.normalWave.energyBoostedNeedsThisWave).toEqual(['food']);
    const expired = tick(first, 13);
    expect(expired.normalWave.energyMode).toBeNull();
    expect(normalWaveEnergyModeAvailable(expired, 'food')).toBe(false);
    expect(applyBootstrapCommand(expired, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' })).toBe(expired);
    const restored = JSON.parse(JSON.stringify(expired)) as BootstrapState;
    expect(applyBootstrapCommand(restored, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' })).toBe(restored);
    expect(normalWaveEnergyModeAvailable(expired, 'reception')).toBe(true);
    let next = applyBootstrapCommand(expired, { type: 'ACTIVATE_ENERGY_MODE', need: 'reception' });
    expect(next.normalWave.energyBoostedNeedsThisWave).toEqual(['food', 'reception']);
    for (let i = 0; i < 720 && next.normalWave.phase !== 'complete'; i++) next = tick(next);
    expect(next.normalWave.phase).toBe('complete');
    next = applyBootstrapCommand(next, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(next.normalWave.energyBoostedNeedsThisWave).toEqual([]);
    next = applyBootstrapCommand(next, { type: 'START_WAVE' });
    expect(normalWaveEnergyModeAvailable(next, 'food')).toBe(true);
    expect(applyBootstrapCommand(next, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' }).normalWave.energyMode?.need).toBe('food');
  });
  it('MVP does not inherit the Prototype-only per-building reuse restriction', () => {
    const first = applyBootstrapCommand(prepared('mvp'), { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
    const expired = tick(first, 13);
    expect(expired.normalWave.energyMode).toBeNull();
    expect(normalWaveEnergyModeAvailable(expired, 'food')).toBe(true);
    const second = applyBootstrapCommand(expired, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
    expect(second.energy).toBe(expired.energy - 1);
    expect(second.normalWave.energyMode?.need).toBe('food');
  });
});
