import { describe, expect, it } from 'vitest';
import { NORMAL_SERVICE_CATALOG, NORMAL_WAVE_NEEDS, applyBootstrapCommand, createInitialBootstrapState, normalWaveForecast, prototypeAreaUnlockView } from './state';

describe('FR-016 starting resort', () => {
  it('initializes Wave 1 with only the three required service buildings and their exact needs', () => {
    const state = createInitialBootstrapState('fr016-start');
    expect(state.currentWaveNumber).toBe(1);
    expect(state.normalWave.phase).toBe('awaiting');
    expect(state.purchasedAreas).toEqual({ pool: false, bungalows: false });
    expect([...NORMAL_WAVE_NEEDS]).toEqual(['reception', 'food', 'drinks']);
    expect(state.normalWave.activeNeedIds).toEqual(['reception', 'food', 'drinks']);
    expect(NORMAL_SERVICE_CATALOG.reception).toEqual({ buildingLabel: 'Reception', needLabel: 'Rooms' });
    expect(NORMAL_SERVICE_CATALOG.food).toEqual({ buildingLabel: 'Restaurant', needLabel: 'Food' });
    expect(NORMAL_SERVICE_CATALOG.drinks).toEqual({ buildingLabel: 'Beach Bar', needLabel: 'Drinks' });
    expect(prototypeAreaUnlockView(state, 'pool').status).toBe('locked');
    expect(prototypeAreaUnlockView(state, 'bungalows').status).toBe('locked');
  });

  it('projects the same starting needs into the Wave 1 forecast and first wave without premature optional areas', () => {
    const state = createInitialBootstrapState('fr016-forecast');
    const forecast = normalWaveForecast(state);
    expect(forecast.needs).toEqual(['reception', 'food', 'drinks']);
    const started = applyBootstrapCommand(state, { type: 'START_WAVE' });
    expect(started.normalWave.phase).toBe('incoming');
    expect(started.normalWave.activeNeedIds).toEqual([...NORMAL_WAVE_NEEDS]);
    expect(started.normalWave.activeNeedIds).not.toContain('relax');
    expect(started.normalWave.activeNeedIds).not.toContain('oceanView');
    expect(started.purchasedAreas).toEqual({ pool: false, bungalows: false });
  });
});
