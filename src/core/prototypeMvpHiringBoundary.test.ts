import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveCanHireWorker } from './state';

const prepared = (stage: 'prototype' | 'mvp') => {
  const state = createInitialBootstrapState('stage-hiring-boundary', undefined, stage);
  return { ...state, coins: 120, normalWave: { ...state.normalWave, buildingLevelsByNeed: { ...state.normalWave.buildingLevelsByNeed, reception: 2 as const } } };
};

describe('Prototype/MVP hiring authority boundary', () => {
  it('rejects all MVP-only hires in Prototype without changing its state', () => {
    const state = prepared('prototype');
    const original = JSON.stringify(state);
    expect(normalWaveCanHireWorker(state, 'food')).toBe(false);
    expect(() => applyBootstrapCommand(state, { type: 'HIRE_MANAGER', need: 'reception' })).toThrow('MVP_MANAGER_STAGE_INVALID');
    expect(() => applyBootstrapCommand(state, { type: 'HIRE_SPECIALIST', specialistId: 'photographer' })).toThrow('MVP_SPECIALIST_STAGE_INVALID');
    expect(() => applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: 'food' })).toThrow('MVP_WORKER_STAGE_INVALID');
    expect(JSON.stringify(state)).toBe(original);
  });
  it('retains legitimate between-wave hiring in MVP', () => {
    const state = prepared('mvp');
    expect(normalWaveCanHireWorker(state, 'food')).toBe(true);
    expect(applyBootstrapCommand(state, { type: 'HIRE_MANAGER', need: 'reception' }).normalWave.hiredManagers.reception).toBe(true);
    expect(applyBootstrapCommand(state, { type: 'HIRE_SPECIALIST', specialistId: 'photographer' }).hiredSpecialists).toContain('photographer');
    expect(applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: 'food' }).normalWave.workerAssignments['worker-hired-1']).toBe('food');
  });
  it('retains scarcity rejection after MVP stage admission', () => {
    const state = { ...createInitialBootstrapState('mvp-scarcity', undefined, 'mvp'), coins: 120 };
    expect(normalWaveCanHireWorker(state, 'food')).toBe(false);
    expect(() => applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: 'food' })).toThrow('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
  });
});
