import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalizePrototypeWorkerRoster, normalWaveCanHireWorker } from './state';

type GameState = ReturnType<typeof createInitialBootstrapState>;
function expectScarce(state: GameState) {
  const wave = state.normalWave;
  const availableSlots = wave.activeNeedIds.reduce((sum, need) => sum + wave.workerSlotsByNeed[need], 0);
  const totalWorkers = Object.keys(wave.workerAssignments).length;
  expect(totalWorkers).toBeLessThan(availableSlots);
  for (const need of wave.activeNeedIds) {
    expect(Object.values(wave.workerAssignments).filter(assigned => assigned === need).length).toBeLessThanOrEqual(wave.workerSlotsByNeed[need]);
  }
}
const prepared = (): GameState => {
  const state = createInitialBootstrapState('fr026-scarcity');
  return { ...state, coins: 120, normalWave: { ...state.normalWave, buildingLevelsByNeed: { ...state.normalWave.buildingLevelsByNeed, reception: 2, food: 2 } } };
};
describe('FR-026 strictly fewer Workers than available Worker slots', () => {
  it('starts with a genuine shortage and does not permit filling the baseline final slot', () => {
    const state = createInitialBootstrapState('fr026-initial');
    expectScarce(state);
    expect(Object.keys(state.normalWave.workerAssignments)).toHaveLength(2);
    expect(normalWaveCanHireWorker({ ...state, coins: 120 }, 'food')).toBe(false);
  });
  it('maintains global shortage throughout successive hiring and prohibits exhausting headroom', () => {
    const state = prepared();
    expectScarce(state);
    const first = applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: 'food' });
    expectScarce(first);
    const second = applyBootstrapCommand(first, { type: 'HIRE_WORKER', to: 'reception' });
    expectScarce(second);
    expect(Object.keys(second.normalWave.workerAssignments)).toHaveLength(4);
    expect(normalWaveCanHireWorker(second, 'food')).toBe(false);
    expect(() => applyBootstrapCommand(second, { type: 'HIRE_WORKER', to: 'food' })).toThrow('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
  });
  it('repairs an overstaffed imported roster rather than preserving a fully occupied workforce', () => {
    const first = applyBootstrapCommand(prepared(), { type: 'HIRE_WORKER', to: 'food' });
    const second = applyBootstrapCommand(first, { type: 'HIRE_WORKER', to: 'reception' });
    const corrupted: GameState = { ...second, normalWave: { ...second.normalWave, workerAssignments: { ...second.normalWave.workerAssignments, 'worker-hired-3': 'food' } } };
    expect(Object.keys(corrupted.normalWave.workerAssignments)).toHaveLength(5);
    const repaired = normalizePrototypeWorkerRoster(corrupted);
    expectScarce(repaired);
    expect(Object.keys(repaired.normalWave.workerAssignments)).toHaveLength(4);
    expect(repaired.normalWave.workerAssignments['worker-hired-3']).toBeUndefined();
  });
  it('retains the shortage when the recruited workforce continues into a new wave', () => {
    const first = applyBootstrapCommand(prepared(), { type: 'HIRE_WORKER', to: 'food' });
    const second = applyBootstrapCommand(first, { type: 'HIRE_WORKER', to: 'reception' });
    const complete: GameState = { ...second, normalWave: { ...second.normalWave, phase: 'complete' } };
    const next = applyBootstrapCommand(complete, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expectScarce(next);
    expect(next.normalWave.workerAssignments['worker-hired-1']).toBe('food');
    expect(next.normalWave.workerAssignments['worker-hired-2']).toBe('reception');
    expectScarce(normalizePrototypeWorkerRoster(next));
  });
});
