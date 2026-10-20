import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveCoinReward, type BootstrapState } from './state';

const tick = (state: BootstrapState) => applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });

function finishAndVerify(state: BootstrapState): BootstrapState {
  let current = applyBootstrapCommand(state, { type: 'START_WAVE' });
  const balance = current.coins;
  let completedTransitions = 0;
  for (let i = 0; i < 900 && current.normalWave.phase !== 'complete'; i++) {
    const previous = current;
    current = tick(current);
    if (current.normalWave.phase !== 'complete') {
      expect(current.coins).toBe(balance);
    } else {
      completedTransitions++;
      expect(previous.normalWave.phase).not.toBe('complete');
      for (const need of current.normalWave.activeNeedIds) {
        expect(current.normalWave.servedByNeed[need]).toBe(current.normalWave.releasedByNeed[need]);
        expect(current.normalWave.queueByNeed[need]).toBe(0);
        expect(current.normalWave.activeByNeed[need]).toBe(0);
      }
      expect(normalWaveCoinReward(current.normalWave)).toBeGreaterThan(0);
      expect(current.coins - balance).toBe(normalWaveCoinReward(current.normalWave));
    }
  }
  expect(current.normalWave.phase).toBe('complete');
  expect(completedTransitions).toBe(1);
  for (let i = 0; i < 20; i++) {
    const after = tick(current);
    expect(after.coins).toBe(current.coins);
    current = after;
  }
  return current;
}

describe('FR-013 service-driven primary Coin income', () => {
  it('does not pay for passive building ticks before, during or between two completed waves', () => {
    let state = createInitialBootstrapState('fr013-active-income');
    const initialCoins = state.coins;
    for (let i = 0; i < 120; i++) {
      state = tick(state);
      expect(state.coins).toBe(initialCoins);
      expect(state.normalWave.phase).toBe('awaiting');
    }
    state = finishAndVerify(state);
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    const earnedCoins = state.coins;
    for (let i = 0; i < 120; i++) {
      state = tick(state);
      expect(state.coins).toBe(earnedCoins);
      expect(state.normalWave.phase).toBe('awaiting');
    }
    state = finishAndVerify(state);
    expect(state.coins).toBeGreaterThan(earnedCoins);
  });
});
