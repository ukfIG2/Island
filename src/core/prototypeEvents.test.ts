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
  for (let guard = 0; guard < 700 && next.normalWave.phase !== 'complete'; guard += 1) next = tick(next);
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

  it('Energy Mode accelerates in-flight work without changing simultaneous capacity', () => {
    let state = complete(createInitialBootstrapState('energy-speed'));
    state = start(continueWave(state));
    for (let i = 0; i < 35; i++) state = tick(state);
    const capacityBefore = normalWaveServiceCapacity(state, 'food');
    const baseline = tick(state);
    const activated = applyBootstrapCommand(state, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
    const boosted = tick(activated);
    expect(boosted.energy).toBe(0);
    expect(normalWaveServiceCapacity(boosted, 'food')).toBe(capacityBefore);
    expect(boosted.normalWave.serviceProgressByNeed.food[0]).toBeGreaterThan(baseline.normalWave.serviceProgressByNeed.food[0]);
  });

  it('permits Energy during draining without increasing the number of service places', () => {
    let state = complete(createInitialBootstrapState('energy-drain'));
    state = start(continueWave(state));
    for (let i = 0; i < 95; i++) state = tick(state);
    expect(state.normalWave.phase).toBe('draining');
    const capacity = normalWaveServiceCapacity(state, 'food');
    const activated = applyBootstrapCommand(state, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
    expect(activated.energy).toBe(state.energy - 1);
    expect(normalWaveServiceCapacity(activated, 'food')).toBe(capacity);
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

  it('injects one unforecast W2 Rush into the currently unstaffed need', () => {
    let state = complete(createInitialBootstrapState('rush'));
    state = continueWave(state);
    expect(state.currentWaveNumber).toBe(2);
    expect(state.normalWave.suddenRush.scheduled).toBe(true);
    expect(state.normalWave.demandTargetByNeed.food).toBe(10);
    state = start(state);
    for (let i = 0; i < 45; i++) state = tick(state);
    expect(state.normalWave.suddenRush.triggered).toBe(true);
    expect(state.normalWave.suddenRush.targetNeed).toBe('food');
    expect(state.normalWave.demandTargetByNeed.food).toBe(16);
    expect(state.normalWave.demandTargetByNeed.drinks).toBe(16);
    expect(state.suddenRushOccurred).toBe(true);
    state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    const energyBefore = state.energy;
    state = complete(state);
    expect(state.normalWave.result).not.toBeNull();
    expect(state.energy).toBe(energyBefore + 1);
    state = continueWave(state);
    expect(state.normalWave.suddenRush.scheduled).toBe(false);
  });
});
