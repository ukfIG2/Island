import type { NormalWaveNeedId, NormalWaveState } from '../core/state';

/** UI projection of Core REASSIGN_WORKER destination rules; no writable authority. */
export function eligibleWorkerDestinations(wave: NormalWaveState, origin: NormalWaveNeedId): readonly NormalWaveNeedId[] {
  if (wave.phase !== 'awaiting' && wave.phase !== 'incoming' && wave.phase !== 'draining') return [];
  const assigned = Object.values(wave.workerAssignments);
  return wave.activeNeedIds.filter((need) =>
    need !== origin && assigned.filter((current) => current === need).length < wave.workerSlotsByNeed[need]
  );
}
