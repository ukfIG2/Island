import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState } from './state';

describe('Finale: wave 8 is terminal at the core boundary', () => {
  it('allows every wave once, then rejects a direct ninth-wave continuation', () => {
    let state = createInitialBootstrapState('wave8-final-core-guard');
    for (let wave = 1; wave <= 8; wave += 1) {
      if (wave > 1) state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
      expect(state.currentWaveNumber).toBe(wave);
      expect(state.normalWave.phase).toBe('awaiting');
      state = applyBootstrapCommand(state, { type: 'START_WAVE' });
      for (let tick = 0; tick < 750 && state.normalWave.phase !== 'complete'; tick += 1) {
        state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
      }
      expect(state.normalWave.phase).toBe('complete');
    }
    expect(state.currentWaveNumber).toBe(8);
    expect(() => applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' }))
      .toThrow('NORMAL_WAVE_CAMPAIGN_COMPLETE');
    expect(state.normalWave.phase).toBe('complete');
  });
});
