import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, NORMAL_WAVE_PROOF_WORKER_ID } from './state';

describe('FR-031 Energy is optional assistance, not a normal-wave progression gate', () => {
  for (const stage of ['prototype', 'mvp'] as const) {
    for (const allocation of ['default', 'food'] as const) {
      it(`${stage} / ${allocation}: earns five stars on served demand without spending Energy and progresses at zero balance`, () => {
        let state = createInitialBootstrapState(`fr031-${stage}-${allocation}`, undefined, stage);
        expect(state.energy).toBe(0);
        if (allocation === 'food') {
          state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: NORMAL_WAVE_PROOF_WORKER_ID, to: 'food' });
        }
        state = applyBootstrapCommand(state, { type: 'START_WAVE' });
        expect(state.normalWave.phase).toBe('incoming');
        expect(state.energy).toBe(0);
        expect(applyBootstrapCommand(state, { type: 'ACTIVATE_ENERGY_MODE', need: 'reception' })).toBe(state);
        let ticks = 0;
        while (state.normalWave.phase !== 'complete' && ticks < 720) {
          state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
          ticks++;
        }
        const wave = state.normalWave;
        expect(wave.phase).toBe('complete');
        const released = wave.activeNeedIds.reduce((count, need) => count + wave.releasedByNeed[need], 0);
        const served = wave.activeNeedIds.reduce((count, need) => count + wave.servedByNeed[need], 0);
        expect(released).toBe(22);
        expect(served).toBe(released);
        expect(wave.result?.rating).toBe(5);
        expect(wave.energyMode).toBeNull();
        // Completion grants one Energy. This is income, not evidence of expenditure.
        expect(state.energy).toBe(1);
        const subsequent = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
        expect(subsequent.currentWaveNumber).toBe(2);
        expect(subsequent.normalWave.phase).toBe('awaiting');
        // Adversarial zero-balance continuation guard; rating proof above uses only actual gameplay commands.
        const zeroBalance = { ...subsequent, energy: 0 };
        const started = applyBootstrapCommand(zeroBalance, { type: 'START_WAVE' });
        expect(started.normalWave.phase).toBe('incoming');
        expect(started.energy).toBe(0);
      });
    }
  }
});
