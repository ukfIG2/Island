import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, type NormalWaveNeedId, type NormalWaveWorkerId } from '../core/state';
import { eligibleWorkerDestinations } from './workerAllocation';

function setup() {
  const s = createInitialBootstrapState('fr056-destinations');
  const w = s.normalWave;
  const state = { ...s, normalWave: { ...w, buildingLevelsByNeed: { ...w.buildingLevelsByNeed, food: 2 as const }, workerSlotsByNeed: { ...w.workerSlotsByNeed, food: 2 } } };
  const entries = Object.entries(w.workerAssignments) as [NormalWaveWorkerId, NormalWaveNeedId][];
  return { state, entries };
}

describe('FR-056 Worker Allocation Core-aligned destinations', () => {
  it('offers active different needs only when a Worker slot remains', () => {
    const { state, entries } = setup();
    const [workerId, from] = entries[0];
    expect(eligibleWorkerDestinations(state.normalWave, from)).not.toContain(from);
    expect(eligibleWorkerDestinations(state.normalWave, from)).toContain('food');
    const moved = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId, to: 'food' });
    expect(moved.normalWave.workerAssignments[workerId]).toBe('food');
    const remaining = entries[1];
    expect(eligibleWorkerDestinations(moved.normalWave, remaining[1])).toContain('food');
    const fullyStaffed = applyBootstrapCommand(moved, { type: 'REASSIGN_WORKER', workerId: remaining[0], to: 'food' });
    expect(eligibleWorkerDestinations(fullyStaffed.normalWave, 'reception')).not.toContain('food');
  });

  it('respects normal-wave phase, without inventing destinations after completion', () => {
    const { state, entries } = setup();
    const from = entries[0][1];
    for (const phase of ['awaiting', 'incoming', 'draining'] as const) {
      expect(eligibleWorkerDestinations({ ...state.normalWave, phase }, from)).toContain('food');
    }
    expect(eligibleWorkerDestinations({ ...state.normalWave, phase: 'complete' }, from)).toEqual([]);
  });

  it('keeps Worker actions in Core, with no fabricated time or currency cost', () => {
    const { state, entries } = setup();
    const [workerId] = entries[0];
    const moved = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId, to: 'food' });
    expect(moved.coins).toBe(state.coins);
    expect(moved.energy).toBe(state.energy);
    expect(moved.normalWave.waveElapsedMs).toBe(state.normalWave.waveElapsedMs);
  });
});
