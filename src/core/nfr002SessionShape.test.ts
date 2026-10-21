import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState } from './state';

describe('NFR-002 normal production session shape', () => {
  it.each(['prototype', 'mvp'] as const)('closes two real Core waves with a valid between-wave investment in the 3–7 minute simulation window (%s)', (stage) => {
    let state = createInitialBootstrapState('nfr002-two-wave-session', undefined, stage);
    const waveDurations: number[] = [];
    for (let wave = 0; wave < 2; wave++) {
      state = applyBootstrapCommand(state, { type: 'START_WAVE' });
      let elapsedMs = 0;
      while (state.normalWave.phase !== 'complete' && elapsedMs < 480_000) {
        state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
        elapsedMs += 1000;
      }
      expect(state.normalWave.phase).toBe('complete');
      expect(state.normalWave.result).not.toBeNull();
      waveDurations.push(elapsedMs);
      if (wave === 0) {
        const coinsBefore = state.coins;
        const levelBefore = state.normalWave.buildingLevelsByNeed.reception;
        state = applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need: 'reception' });
        expect(state.coins).toBeLessThan(coinsBefore);
        expect(state.normalWave.buildingLevelsByNeed.reception).toBeGreaterThan(levelBefore);
        state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
        expect(state.normalWave.phase).toBe('awaiting');
      }
    }
    const totalMs = waveDurations.reduce((sum, ms) => sum + ms, 0);
    expect(totalMs).toBeGreaterThanOrEqual(180_000);
    expect(totalMs).toBeLessThanOrEqual(420_000);
    console.log('NFR002_DURABLE_SESSION_EVIDENCE ' + JSON.stringify({ stage, waveDurations, totalMs, finalPhase: state.normalWave.phase, finalCoins: state.coins }));
  });
});
