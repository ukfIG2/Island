import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveForecast, prototypeAreaUnlockView, type BootstrapState } from './state';

function completeWave(state: BootstrapState): BootstrapState {
  let next = applyBootstrapCommand(state, { type: 'START_WAVE' });
  for (let guard = 0; guard < 900 && next.normalWave.phase !== 'complete'; guard += 1) {
    next = applyBootstrapCommand(next, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  }
  expect(next.normalWave.phase).toBe('complete');
  return next;
}

function assertUnpurchasedNeedAbsent(state: BootstrapState, area: 'pool' | 'bungalows', need: 'relax' | 'oceanView') {
  expect(state.purchasedAreas[area]).toBe(false);
  expect(state.normalWave.activeNeedIds).not.toContain(need);
  expect(state.normalWave.demandTargetByNeed[need]).toBe(0);
  expect(state.normalWave.releasedByNeed[need]).toBe(0);
  expect(state.normalWave.servedByNeed[need]).toBe(0);
  expect(state.normalWave.queueByNeed[need]).toBe(0);
  expect(state.normalWave.activeByNeed[need]).toBe(0);
}

describe('FR-018 eligible but unpurchased service demand', () => {
  it('keeps both future needs absent throughout all eight waves when areas are never purchased', () => {
    let state = createInitialBootstrapState('fr018-never-purchase');
    for (let waveNumber = 1; waveNumber <= 8; waveNumber += 1) {
      expect(state.currentWaveNumber).toBe(waveNumber);
      expect(normalWaveForecast(state).needs).toEqual(['reception', 'food', 'drinks']);
      assertUnpurchasedNeedAbsent(state, 'pool', 'relax');
      assertUnpurchasedNeedAbsent(state, 'bungalows', 'oceanView');
      state = completeWave(state);
      assertUnpurchasedNeedAbsent(state, 'pool', 'relax');
      assertUnpurchasedNeedAbsent(state, 'bungalows', 'oceanView');
      if (waveNumber === 3) expect(prototypeAreaUnlockView(state, 'pool').status).toBe('available');
      if (waveNumber === 6) expect(['available', 'not_affordable']).toContain(prototypeAreaUnlockView(state, 'bungalows').status);
      if (waveNumber < 8) state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    }
    expect(state.currentWaveNumber).toBe(8);
    expect(state.normalWave.phase).toBe('complete');
  });

  it('activates each associated need only after a deliberately delayed purchase', () => {
    let state = createInitialBootstrapState('fr018-buy-later');
    for (let wave = 1; wave <= 4; wave += 1) {
      state = completeWave(state);
      assertUnpurchasedNeedAbsent(state, 'pool', 'relax');
      if (wave < 4) state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    }
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(state.currentWaveNumber).toBe(5);
    expect(prototypeAreaUnlockView(state, 'pool').status).toBe('available');
    assertUnpurchasedNeedAbsent(state, 'pool', 'relax');
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'pool' });
    expect(state.purchasedAreas.pool).toBe(true);
    expect(state.normalWave.activeNeedIds).toContain('relax');
    expect(state.normalWave.workerAssignments['worker-2']).toBe('relax');
    expect(state.normalWave.demandTargetByNeed.relax).toBeGreaterThan(0);
    for (let wave = 5; wave <= 7; wave += 1) {
      state = completeWave(state);
      assertUnpurchasedNeedAbsent(state, 'bungalows', 'oceanView');
      if (wave < 7) state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    }
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(state.currentWaveNumber).toBe(8);
    assertUnpurchasedNeedAbsent(state, 'bungalows', 'oceanView');
    expect(prototypeAreaUnlockView(state, 'bungalows').status).toBe('available');
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'bungalows' });
    expect(state.purchasedAreas.bungalows).toBe(true);
    expect(state.normalWave.workerAssignments['worker-3']).toBe('oceanView');
    expect(state.normalWave.activeNeedIds).toContain('oceanView');
    expect(state.normalWave.demandTargetByNeed.oceanView).toBeGreaterThan(0);
    expect(normalWaveForecast(state).needs).toEqual(['reception', 'food', 'drinks', 'relax', 'oceanView']);
    state = completeWave(state);
    expect(state.normalWave.servedByNeed.oceanView).toBeGreaterThan(0);
  });
});
