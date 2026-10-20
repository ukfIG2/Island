import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveServiceSpeed, MVP_MULTI_WORKER_PROOF_TUNING } from './state';

function staffed(extra: 0 | 1 | 2) {
  const initial = createInitialBootstrapState('fr027-multi-worker');
  const need = Object.values(initial.normalWave.workerAssignments)[0]!;
  const assignments = { ...initial.normalWave.workerAssignments, ...(extra >= 1 ? { 'worker-hired-1': need } : {}), ...(extra >= 2 ? { 'worker-hired-2': need } : {}) };
  const state = { ...initial, normalWave: { ...initial.normalWave, buildingLevelsByNeed: { ...initial.normalWave.buildingLevelsByNeed, [need]: 3 as const }, workerSlotsByNeed: { ...initial.normalWave.workerSlotsByNeed, [need]: 3 }, workerAssignments: assignments } };
  return { state, need };
}
describe('FR-027 multi-worker allocation and diminishing marginal service', () => {
  it('assigns strictly diminishing, positive marginal service multipliers for 1, 2 and 3 Workers', () => {
    expect(MVP_MULTI_WORKER_PROOF_TUNING.marginalDecay).toBeGreaterThan(0);
    expect(MVP_MULTI_WORKER_PROOF_TUNING.marginalDecay).toBeLessThan(1);
    const speeds = ([0, 1, 2] as const).map(extra => { const { state, need } = staffed(extra); return normalWaveServiceSpeed(state, need); });
    expect(speeds[0]).toBeCloseTo(1);
    expect(speeds[1]).toBeCloseTo(1.5);
    expect(speeds[2]).toBeCloseTo(1.75);
    expect(speeds[2] - speeds[1]).toBeGreaterThan(0);
    expect(speeds[1] - speeds[0]).toBeGreaterThan(speeds[2] - speeds[1]);
  });
  it('increases actual service progress with decreasing marginal benefit during an elapsed simulation tick', () => {
    const progress = ([0, 1, 2] as const).map(extra => {
      const { state, need } = staffed(extra);
      const started = applyBootstrapCommand(state, { type: 'START_WAVE' });
      const seeded = { ...started, normalWave: { ...started.normalWave, serviceProgressByNeed: { ...started.normalWave.serviceProgressByNeed, [need]: [0] }, activeByNeed: { ...started.normalWave.activeByNeed, [need]: 1 } } };
      const advanced = applyBootstrapCommand(seeded, { type: 'ADVANCE_SIMULATION', deltaMs: 250 });
      expect(advanced.normalWave.serviceProgressByNeed[need]).toHaveLength(1);
      return advanced.normalWave.serviceProgressByNeed[need][0]!;
    });
    expect(progress[0]).toBeGreaterThan(0);
    expect(progress[1]).toBeGreaterThan(progress[0]);
    expect(progress[2]).toBeGreaterThan(progress[1]);
    expect(progress[1] - progress[0]).toBeGreaterThan(progress[2] - progress[1]);
  });
  it('allows actual reassignment into an already staffed building when there is a free slot', () => {
    const { state, need } = staffed(0);
    const other = Object.entries(state.normalWave.workerAssignments).find(([, destination]) => destination !== need);
    expect(other).toBeDefined();
    const moved = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: other![0] as keyof typeof state.normalWave.workerAssignments, to: need });
    expect(Object.values(moved.normalWave.workerAssignments).filter(to => to === need)).toHaveLength(2);
    expect(normalWaveServiceSpeed(moved, need)).toBeGreaterThan(normalWaveServiceSpeed(state, need));
    const totalSlots = moved.normalWave.activeNeedIds.reduce((sum, target) => sum + moved.normalWave.workerSlotsByNeed[target], 0);
    expect(Object.keys(moved.normalWave.workerAssignments).length).toBeLessThan(totalSlots);
  });
});
