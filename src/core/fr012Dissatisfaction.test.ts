import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveCoinReward, type BootstrapState } from './state';

const adverseTuning = {
  totalDemand: 12,
  releasePerTick: 4,
  baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 1, oceanView: 1 },
  queuePressurePerLostStar: 0.5,
  arrivalDurationMs: 1000,
  serviceDurationMs: 1000
} as const;

function finish(state: BootstrapState): BootstrapState {
  let next = applyBootstrapCommand(state, { type: 'START_WAVE' });
  for (let i = 0; i < 256 && next.normalWave.phase !== 'complete'; i++) {
    next = applyBootstrapCommand(next, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  }
  expect(next.normalWave.phase).toBe('complete');
  return next;
}

describe('FR-012 post-wave dissatisfaction remains presentation-only', () => {
  it('applies only the canonical rating-adjusted reward and no carry-over penalty from a poor result', () => {
    const initial = createInitialBootstrapState('fr012-adverse', adverseTuning);
    const completed = finish(initial);
    const result = completed.normalWave.result!;
    expect(result.rating).toBeLessThan(5);
    expect(result.satisfaction.totalWaitingTime).toBeGreaterThan(0);
    expect(completed.coins - initial.coins).toBe(normalWaveCoinReward(completed.normalWave));
    const idle = applyBootstrapCommand(completed, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
    expect(idle.coins).toBe(completed.coins);
    expect(idle.energy).toBe(completed.energy);
    expect(idle.normalWave).toEqual(completed.normalWave);
    const next = applyBootstrapCommand(idle, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(next.currentWaveNumber).toBe(2);
    expect(next.coins).toBe(completed.coins);
    expect(next.energy).toBe(completed.energy);
    expect(next.resortValue).toBe(completed.resortValue);
    expect(next.normalWave.phase).toBe('awaiting');
    expect(next.normalWave.result).toBeNull();
    expect(next.normalWave.totalQueuePressure).toBe(0);
    expect(Object.values(next.normalWave.accumulatedWaitByNeed).every(v => v === 0)).toBe(true);
    expect(Object.values(next.normalWave.queueByNeed).every(v => v === 0)).toBe(true);
    expect(next.normalWave.workerAssignments).toEqual(completed.normalWave.workerAssignments);
    expect(next.normalWave.buildingLevelsByNeed).toEqual(completed.normalWave.buildingLevelsByNeed);
  });

  it('does not read explanatory or dissatisfaction outcome fields to initialize future play', () => {
    const completed = finish(createInitialBootstrapState('fr012-projection', adverseTuning));
    const result = completed.normalWave.result!;
    const presentationOnly: BootstrapState = {
      ...completed,
      normalWave: {
        ...completed.normalWave,
        result: {
          ...result,
          satisfaction: { ...result.satisfaction, totalWaitingTime: result.satisfaction.totalWaitingTime + 1000 },
          explanation: ['Presentation-only post-wave depiction'],
          guidance: 'Presentation-only guest feedback'
        }
      }
    };
    const referenceNext = applyBootstrapCommand(completed, { type: 'CONTINUE_TO_NEXT_WAVE' });
    const projectedNext = applyBootstrapCommand(presentationOnly, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(projectedNext).toEqual(referenceNext);
  });
});
