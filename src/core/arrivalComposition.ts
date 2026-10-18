import type { NormalWavePhase, PrototypeWaveNumber } from './state';

export type ArrivalSourceKind = 'small-boat' | 'speedboats' | 'ferry' | 'seaplane';

export interface ArrivalComposition {
  readonly source: ArrivalSourceKind;
  readonly label: string;
  readonly craftCount: number;
  readonly visibleGuestLimit: number;
}

export interface ArrivalCraftProjection {
  readonly id: string;
  readonly source: ArrivalSourceKind;
  readonly progress: number;
  readonly lane: number;
}

const ARRIVAL_BY_WAVE: Readonly<Record<PrototypeWaveNumber, ArrivalComposition>> = {
  1: { source: 'small-boat', label: 'Island shuttle', craftCount: 1, visibleGuestLimit: 3 },
  2: { source: 'speedboats', label: 'Speedboat arrivals', craftCount: 3, visibleGuestLimit: 4 },
  3: { source: 'ferry', label: 'Resort ferry', craftCount: 1, visibleGuestLimit: 6 },
  4: { source: 'small-boat', label: 'Island shuttle', craftCount: 2, visibleGuestLimit: 4 },
  5: { source: 'speedboats', label: 'Speedboat rush', craftCount: 3, visibleGuestLimit: 5 },
  6: { source: 'ferry', label: 'Resort ferry', craftCount: 1, visibleGuestLimit: 6 },
  7: { source: 'seaplane', label: 'Seaplane transfer', craftCount: 1, visibleGuestLimit: 5 },
  8: { source: 'seaplane', label: 'Final air transfer', craftCount: 2, visibleGuestLimit: 6 }
};

export function arrivalCompositionForWave(waveNumber: PrototypeWaveNumber): ArrivalComposition {
  return ARRIVAL_BY_WAVE[waveNumber];
}

export function arrivalProgress(
  phase: NormalWavePhase,
  releasedDemand: number,
  totalDemand: number
): number {
  if (phase === 'awaiting') return 0;
  if (phase === 'complete') return 1;
  if (totalDemand <= 0) return 0;
  return Math.max(0, Math.min(1, releasedDemand / totalDemand));
}

export function arrivalCraftProjection(
  waveNumber: PrototypeWaveNumber,
  phase: NormalWavePhase,
  releasedDemand: number,
  totalDemand: number
): readonly ArrivalCraftProjection[] {
  const composition = arrivalCompositionForWave(waveNumber);
  const base = arrivalProgress(phase, releasedDemand, totalDemand);

  return Array.from({ length: composition.craftCount }, (_, index) => {
    const stagger = composition.source === 'speedboats' ? index * 0.2 : index * 0.12;
    const pace = composition.source === 'speedboats' ? 1.45 : composition.source === 'ferry' ? 0.9 : 1;
    return {
      id: `${composition.source}-${index}`,
      source: composition.source,
      progress: Math.max(0, Math.min(1, base * pace - stagger)),
      lane: index - (composition.craftCount - 1) / 2
    };
  });
}
