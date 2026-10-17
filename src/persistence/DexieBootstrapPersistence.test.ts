import {
  describe,
  expect,
  it
} from 'vitest';

import {
  NORMAL_WAVE_PROOF_WORKER_ID,
  createInitialBootstrapState,
  type BootstrapState
} from '../core/state';
import { normalizePersistedState } from './DexieBootstrapPersistence';

describe('normalizePersistedState', () => {
  it('preserves a canonical current snapshot', () => {
    const current = createInitialBootstrapState('canonical');

    expect(normalizePersistedState(current)).toBe(current);
  });

  it('upgrades a prior normal-wave snapshot to the canonical shape safely', () => {
    const legacy = {
      schema: 'resort-bootstrap-state/v1',
      bootId: 'legacy',
      simulationTick: 17,
      elapsedSimulationMs: 3400,
      normalWave: {
        phase: 'incoming',
        tuning: {
          totalDemand: 6,
          releasePerTick: 2,
          baseServiceCapacity: { reception: 1, food: 1 },
          queuePressurePerLostStar: 4
        },
        releasedDemand: 4,
        queueByNeed: { reception: 0, food: 2 },
        servedByNeed: { reception: 4, food: 2 },
        peakQueueByNeed: { reception: 0, food: 2 },
        totalQueuePressure: 3,
        workerAssignments: {
          [NORMAL_WAVE_PROOF_WORKER_ID]: 'food'
        },
        reassignments: [],
        result: null
      }
    } as unknown as BootstrapState;

    const migrated = normalizePersistedState(legacy);

    expect(migrated).toMatchObject({
      bootId: 'legacy',
      simulationTick: 17,
      elapsedSimulationMs: 3400,
      normalWave: {
        phase: 'incoming',
        activeByNeed: { reception: 0, food: 0 },
        accumulatedWaitByNeed: { reception: 0, food: 0 },
        staffingWaitByNeed: { reception: 0, food: 0 },
        capacityWaitByNeed: { reception: 0, food: 0 },
        workerSlotsByNeed: { reception: 1, food: 1 },
        workerAssignments: {
          [NORMAL_WAVE_PROOF_WORKER_ID]: 'food'
        }
      }
    });
  });
});
