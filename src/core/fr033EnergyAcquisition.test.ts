import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, PROTOTYPE_ENERGY_PROOF_TUNING, type BootstrapState } from './state';

function advance(state: BootstrapState): BootstrapState {
  return applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
}
function finishWave(state: BootstrapState, priorEnergy: number): BootstrapState {
  let progressed = 0;
  while (state.normalWave.phase !== 'complete' && progressed < 720) {
    state = advance(state);
    progressed++;
    if (state.normalWave.phase !== 'complete') expect(state.energy).toBe(priorEnergy);
  }
  expect(state.normalWave.phase).toBe('complete');
  expect(state.normalWave.releasedDemand).toBeGreaterThan(0);
  expect(state.normalWave.servedByNeed.reception + state.normalWave.servedByNeed.food + state.normalWave.servedByNeed.drinks).toBeGreaterThan(0);
  expect(state.energy).toBe(priorEnergy + PROTOTYPE_ENERGY_PROOF_TUNING.earnedPerCompletedWave);
  return state;
}
describe('FR-033 Energy is earned by finished gameplay, not required for service', () => {
  for (const stage of ['prototype', 'mvp'] as const) {
    it(stage + ': completion reward occurs once and is not duplicated by further simulation', () => {
      let state = createInitialBootstrapState('fr033-' + stage, undefined, stage);
      expect(state.energy).toBe(0);
      state = applyBootstrapCommand(state, { type: 'START_WAVE' });
      expect(state.energy).toBe(0);
      expect(applyBootstrapCommand(state, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' })).toBe(state);
      state = finishWave(state, 0);
      const earned = state.energy;
      for (let i = 0; i < 8; i++) state = advance(state);
      expect(state.energy).toBe(earned);
      state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
      expect(state.energy).toBe(earned);
      state = applyBootstrapCommand(state, { type: 'START_WAVE' });
      expect(state.energy).toBe(earned);
      state = finishWave(state, earned);
      for (let i = 0; i < 8; i++) state = advance(state);
      expect(state.energy).toBe(earned + PROTOTYPE_ENERGY_PROOF_TUNING.earnedPerCompletedWave);
    });
    it(stage + ': zero Energy never gates active guest services or wave completion', () => {
      let state = createInitialBootstrapState('fr033-zero-' + stage, undefined, stage);
      state = applyBootstrapCommand(state, { type: 'START_WAVE' });
      expect(state.normalWave.phase).toBe('incoming');
      expect(state.energy).toBe(0);
      state = finishWave(state, 0);
      expect(state.normalWave.result).not.toBeNull();
      expect(state.normalWave.energyMode).toBeNull();
    });
  }
});
