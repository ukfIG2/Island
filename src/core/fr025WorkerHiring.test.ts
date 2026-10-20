import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalizePrototypeWorkerRoster, normalWaveCanHireWorker, MVP_WORKER_PROOF_TUNING } from './state';
const prepared = () => {
  const state = createInitialBootstrapState('fr025');
  return { ...state, coins: 120, normalWave: { ...state.normalWave, buildingLevelsByNeed: { ...state.normalWave.buildingLevelsByNeed, reception: 2 as const } } };
};
describe('FR-025 Additional Worker hiring', () => {
  it('preserves the original Prototype scarcity without upgrades', () => {
    const state = createInitialBootstrapState('fr025-prototype');
    expect(normalWaveCanHireWorker({ ...state, coins: 120 }, 'food')).toBe(false);
    expect(() => applyBootstrapCommand({ ...state, coins: 120 }, { type: 'HIRE_WORKER', to: 'food' })).toThrow('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
  });
  it('charges once, assigns directly and activates an available reserve slot elsewhere', () => {
    const state = prepared();
    expect(normalWaveCanHireWorker(state, 'food')).toBe(true);
    const hired = applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: 'food' });
    expect(hired.coins).toBe(state.coins - MVP_WORKER_PROOF_TUNING.hireCostCoins);
    expect(hired.normalWave.workerAssignments['worker-hired-1']).toBe('food');
    expect(hired.normalWave.workerSlotsByNeed.reception).toBe(2);
    expect(Object.keys(hired.normalWave.workerAssignments)).toHaveLength(3);
    expect(state.normalWave.workerAssignments['worker-hired-1']).toBeUndefined();
    expect(normalWaveCanHireWorker(hired, 'relax')).toBe(false);
    expect(() => applyBootstrapCommand(hired, { type: 'HIRE_WORKER', to: 'food' })).toThrow('NORMAL_WAVE_SLOT_OCCUPIED');
  });
  it('rejects unaffordable, inactive and in-progress hiring', () => {
    const state = prepared();
    expect(normalWaveCanHireWorker({ ...state, coins: 0 }, 'food')).toBe(false);
    expect(() => applyBootstrapCommand({ ...state, coins: 0 }, { type: 'HIRE_WORKER', to: 'food' })).toThrow('NORMAL_WAVE_HIRE_COINS_INSUFFICIENT');
    expect(() => applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: 'relax' })).toThrow('NORMAL_WAVE_TARGET_INACTIVE');
    const playing = applyBootstrapCommand(state, { type: 'START_WAVE' });
    expect(() => applyBootstrapCommand(playing, { type: 'HIRE_WORKER', to: 'food' })).toThrow('NORMAL_WAVE_HIRE_PHASE_INVALID');
  });
  it('preserves recruited identity, assigned slot and reserve across normalization and wave transition', () => {
    const hired = applyBootstrapCommand(prepared(), { type: 'HIRE_WORKER', to: 'food' });
    const normalized = normalizePrototypeWorkerRoster(hired);
    expect(normalized.normalWave.workerAssignments['worker-hired-1']).toBe('food');
    expect(normalized.normalWave.workerSlotsByNeed.reception).toBe(2);
    const complete = { ...normalized, normalWave: { ...normalized.normalWave, phase: 'complete' as const } };
    const next = applyBootstrapCommand(complete, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(next.normalWave.workerAssignments['worker-hired-1']).toBe('food');
    expect(next.normalWave.workerSlotsByNeed.reception).toBe(2);
    expect(normalizePrototypeWorkerRoster(next).normalWave.workerAssignments['worker-hired-1']).toBe('food');
  });
  it('allocates unique persistent IDs across multiple paid recruitments while retaining reserve capacity', () => {
    const first = applyBootstrapCommand({ ...prepared(), normalWave: { ...prepared().normalWave, buildingLevelsByNeed: { ...prepared().normalWave.buildingLevelsByNeed, reception: 2 as const, food: 2 as const } } }, { type: 'HIRE_WORKER', to: 'food' });
    expect(normalWaveCanHireWorker(first, 'reception')).toBe(true);
    const second = applyBootstrapCommand(first, { type: 'HIRE_WORKER', to: 'reception' });
    expect(second.normalWave.workerAssignments['worker-hired-1']).toBe('food');
    expect(second.normalWave.workerAssignments['worker-hired-2']).toBe('reception');
    expect(second.coins).toBe(120 - 2 * MVP_WORKER_PROOF_TUNING.hireCostCoins);
    expect(second.normalWave.workerSlotsByNeed.food).toBe(2);
    expect(Object.keys(normalizePrototypeWorkerRoster(second).normalWave.workerAssignments)).toHaveLength(4);
  });
});
