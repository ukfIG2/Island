import { describe, expect, it } from 'vitest';
import {
  applyBootstrapCommand,
  createInitialBootstrapState,
  normalWaveForecast,
  normalWaveServiceCapacity,
  normalWaveCoinReward,
  PROTOTYPE_ECONOMY_PROOF_TUNING,
  type BootstrapState
} from './state';

function start(state: BootstrapState): BootstrapState {
  return applyBootstrapCommand(state, { type: 'START_WAVE' });
}

function tick(state: BootstrapState): BootstrapState {
  return applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
}

function complete(state: BootstrapState): BootstrapState {
  let next = state.normalWave.phase === 'awaiting' ? start(state) : state;
  for (let guard = 0; guard < 100 && next.normalWave.phase !== 'complete'; guard += 1) next = tick(next);
  if (next.normalWave.phase !== 'complete') throw new Error('TEST_WAVE_DID_NOT_COMPLETE');
  return next;
}

function continueWave(state: BootstrapState): BootstrapState {
  return applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
}

describe('Prototype economy and return canonical contracts', () => {
  it('pays structural Coin income only on wave completion using volume x per-unit x rating modifier', () => {
    let state = createInitialBootstrapState('wave-income');
    const startingCoins = state.coins;
    state = start(state);
    const during = tick(state);
    expect(during.coins).toBe(startingCoins);
    const completed = complete(during);
    const reward = normalWaveCoinReward(completed.normalWave);
    expect(reward).toBe(Math.round(completed.normalWave.releasedDemand * PROTOTYPE_ECONOMY_PROOF_TUNING.perUnitCoinValue * PROTOTYPE_ECONOMY_PROOF_TUNING.ratingModifierByRating[completed.normalWave.result!.rating]));
    expect(completed.coins).toBe(startingCoins + reward);
    expect(tick(completed).coins).toBe(completed.coins);
  });

  it('uses a fixed comeback reward independent of elapsed time', () => {
    const initial = createInitialBootstrapState('comeback');
    const returned = applyBootstrapCommand(initial, { type: 'CLAIM_COMEBACK_REWARD' });
    expect(returned.coins - initial.coins).toBe(PROTOTYPE_ECONOMY_PROOF_TUNING.comebackRewardCoins);
    expect(returned.energy).toBe(initial.energy);
    expect(returned.resortValue).toBe(initial.resortValue);
    expect(returned.normalWave).toBe(initial.normalWave);
  });
});

describe('Prototype Energy and Sudden Rush canonical contracts', () => {
  it('keeps zero Energy non-blocking and earns uncapped Energy from completed gameplay', () => {
    let state = createInitialBootstrapState('energy-earned');
    expect(state.energy).toBe(0);
    state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    expect(state.normalWave.workerAssignments['worker-1']).toBe('food');
    state = complete(state);
    expect(state.energy).toBe(1);
    state = continueWave(state);
    state = complete(state);
    expect(state.energy).toBe(2);
  });

  it('Energy Mode increases service speed without changing simultaneous capacity and works during a wave', () => {
    let earned = complete(createInitialBootstrapState('energy-speed'));
    earned = continueWave(earned);
    earned = start(earned);
    const capacityBefore = normalWaveServiceCapacity(earned, 'food');
    const baseline = tick(earned);
    const boostedStart = applyBootstrapCommand(earned, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
    expect(boostedStart.energy).toBe(0);
    expect(normalWaveServiceCapacity(boostedStart, 'food')).toBe(capacityBefore);
    const boosted = tick(boostedStart);
    expect(normalWaveServiceCapacity(boosted, 'food')).toBe(capacityBefore);
    expect(boosted.normalWave.servedByNeed.food).toBeGreaterThan(baseline.normalWave.servedByNeed.food);
  });

  it('activates Energy during draining as a speed modifier without changing capacity', () => {
    let state = createInitialBootstrapState('energy-drain', { totalDemand: 4, releasePerTick: 4, baseServiceCapacity: { reception: 1, food: 1, drinks: 1, relax: 1, oceanView: 1 }, queuePressurePerLostStar: 4 });
    state = { ...state, energy: 1 };
    state = start(state);
    state = tick(state);
    expect(state.normalWave.phase).toBe('draining');
    const capacity = normalWaveServiceCapacity(state, 'food');
    const baseline = tick(state);
    const activated = applyBootstrapCommand(state, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
    const boosted = tick(activated);
    expect(normalWaveServiceCapacity(activated, 'food')).toBe(capacity);
    expect(boosted.normalWave.servedByNeed.food).toBeGreaterThan(baseline.normalWave.servedByNeed.food);
  });

  it('permits a highest rating without spending Energy when the resort is fully prepared', () => {
    const initial = createInitialBootstrapState('energy-optional');
    let state: BootstrapState = {
      ...initial,
      normalWave: {
        ...initial.normalWave,
        buildingLevelsByNeed: { reception: 3, food: 3, drinks: 3, relax: 3, oceanView: 3 }
      }
    };
    state = complete(state);
    expect(state.normalWave.result?.rating).toBe(5);
    expect(state.energy).toBe(1);
    expect(state.normalWave.energyMode).toBeNull();
  });

  it('injects an unforecast Sudden Rush inside the normal wave without pausing Worker response', () => {
    let state = createInitialBootstrapState('rush');
    for (let wave = 1; wave < 5; wave += 1) {
      state = complete(state);
      state = continueWave(state);
    }
    expect(state.currentWaveNumber).toBe(5);
    expect(normalWaveForecast(state).totalDemand).toBe(state.normalWave.tuning.totalDemand);
    expect(state.normalWave.suddenRush.scheduled).toBe(true);
    state = start(state);
    for (let guard = 0; guard < 20 && !state.normalWave.suddenRush.triggered; guard += 1) state = tick(state);
    expect(state.normalWave.suddenRush.triggered).toBe(true);
    expect(state.suddenRushOccurred).toBe(true);
    expect(state.normalWave.phase).not.toBe('awaiting');
    expect(state.normalWave.demandTargetByNeed.reception).toBeGreaterThan(state.normalWave.tuning.totalDemand);
    state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    expect(state.normalWave.workerAssignments['worker-1']).toBe('food');
    const energyBefore = state.energy;
    state = complete(state);
    expect(state.normalWave.result).not.toBeNull();
    expect(state.energy).toBe(energyBefore + 1);
    state = continueWave(state);
    expect(state.normalWave.suddenRush.scheduled).toBe(false);
  });
});
