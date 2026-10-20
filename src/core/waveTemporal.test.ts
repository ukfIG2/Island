import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveServiceCapacity, type BootstrapState } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
const advance = (s: BootstrapState, ms = 1000) => applyBootstrapCommand(s, { type: 'ADVANCE_SIMULATION', deltaMs: ms });
function finish(s: BootstrapState): BootstrapState {
  let next = s.normalWave.phase === 'awaiting' ? applyBootstrapCommand(s, { type: 'START_WAVE' }) : s;
  for (let i = 0; i < 650 && next.normalWave.phase !== 'complete'; i++) next = advance(next);
  if (next.normalWave.phase !== 'complete') throw new Error('WAVE_TIMEOUT');
  return next;
}
describe('Elapsed-time wave gameplay contract', () => {
  it('uses studio W1 demand and offers the tutorial Perfect without Energy', () => {
    const initial = createInitialBootstrapState('temporal-w1');
    expect(initial.normalWave.demandTargetByNeed).toMatchObject({ reception: 8, food: 6, drinks: 8 });
    const completed = finish(initial);
    expect(completed.normalWave.waveElapsedMs).toBeGreaterThan(90_000);
    expect(completed.normalWave.result?.rating).toBe(5);
    expect(completed.normalWave.servedByNeed).toMatchObject({ reception: 8, food: 6, drinks: 8 });
    expect(completed.normalWave.activeByNeed).toMatchObject({ reception: 0, food: 0, drinks: 0 });
    expect(completed.energy).toBe(1);
  });
  it('uses elapsed time rather than number of dispatches to release regular demand', () => {
    const initial = applyBootstrapCommand(createInitialBootstrapState('partition'), { type: 'START_WAVE' });
    const a = advance(initial, 20_000);
    let b = initial;
    for (let i = 0; i < 80; i++) b = advance(b, 250);
    expect(a.normalWave.releasedByNeed).toEqual(b.normalWave.releasedByNeed);
    expect(a.normalWave.queueByNeed).toEqual(b.normalWave.queueByNeed);
    expect(a.normalWave.activeByNeed).toEqual(b.normalWave.activeByNeed);
    expect(a.normalWave.waveElapsedMs).toBe(b.normalWave.waveElapsedMs);
  });
  it('triggers W2 Rush on the unstaffed need, keeps it out of forecast and rewards a Worker response', () => {
    const completedW1 = finish(createInitialBootstrapState('rush-contrast'));
    const awaitingW2 = applyBootstrapCommand(completedW1, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(awaitingW2.normalWave.demandTargetByNeed.food).toBe(10);
    let w2 = applyBootstrapCommand(awaitingW2, { type: 'START_WAVE' });
    for (let i = 0; i < 50; i++) w2 = advance(w2);
    expect(w2.normalWave.suddenRush.targetNeed).toBe('food');
    expect(w2.normalWave.demandTargetByNeed).toMatchObject({ reception: 12, food: 16, drinks: 16 });
    const ignored = finish(w2);
    const moved = applyBootstrapCommand(w2, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    expect(normalWaveServiceCapacity(moved, 'food')).toBe(normalWaveServiceCapacity(w2, 'food'));
    expect(moved.normalWave.reassignments.at(-1)).toMatchObject({
      fromSpeedBefore: 1, fromSpeedAfter: 0.33, toSpeedBefore: 0.33, toSpeedAfter: 1
    });
    const managed = finish(moved);
    expect(managed.normalWave.result!.totalQueuePressure).toBeLessThan(ignored.normalWave.result!.totalQueuePressure);
    expect(managed.normalWave.result!.rating).toBeGreaterThan(ignored.normalWave.result!.rating);
    expect(managed.normalWave.waveElapsedMs).toBeLessThan(ignored.normalWave.waveElapsedMs);
  });
  it('keeps old in-progress save demand, queues, worker assignments and service occupancy', () => {
    let state = applyBootstrapCommand(createInitialBootstrapState('v1-active'), { type: 'START_WAVE' });
    for (let i = 0; i < 40; i++) state = advance(state);
    const legacy: any = JSON.parse(JSON.stringify(state));
    delete legacy.normalWave.waveElapsedMs;
    delete legacy.normalWave.serviceProgressByNeed;
    delete legacy.normalWave.tuning.arrivalDurationMs;
    delete legacy.normalWave.tuning.serviceDurationMs;
    delete legacy.normalWave.tuning.unstaffedServiceSpeed;
    const migrated = normalizePersistedState(legacy);
    expect(migrated.currentWaveNumber).toBe(state.currentWaveNumber);
    expect(migrated.normalWave.queueByNeed).toEqual(state.normalWave.queueByNeed);
    expect(migrated.normalWave.activeByNeed).toEqual(state.normalWave.activeByNeed);
    expect(migrated.normalWave.releasedByNeed).toEqual(state.normalWave.releasedByNeed);
    expect(migrated.normalWave.workerAssignments).toEqual(state.normalWave.workerAssignments);
    expect(migrated.normalWave.serviceProgressByNeed.food.length).toBe(state.normalWave.activeByNeed.food);
  });
});
