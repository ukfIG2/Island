/** FR-029 MVP-only progression extension. Numeric balance is provisional OPEN/TUNING. */
export type ResortProgressionStage = 'prototype' | 'mvp';
export type MvpBuildingLevel = 1 | 2 | 3 | 4 | 5;
export type MvpExtensionLevel = 4 | 5;
export interface MvpExtensionEffect {
  readonly capacityIncrease: number;
  readonly workerSlotsIncrease: number;
  readonly qualityBonus: number;
  readonly coinCost: number;
  readonly resortValueGain: number;
}
// Level 4 has deliberately no capacity increase. Values other than structural effects are provisional.
export const MVP_BUILDING_EXTENSION_PROOF_TUNING: Readonly<Record<MvpExtensionLevel, MvpExtensionEffect>> = {
  4: { capacityIncrease: 0, workerSlotsIncrease: 1, qualityBonus: 1, coinCost: 30, resortValueGain: 3 },
  5: { capacityIncrease: 2, workerSlotsIncrease: 1, qualityBonus: 2, coinCost: 40, resortValueGain: 4 }
};
export function nextBuildingLevel(stage: ResortProgressionStage, level: MvpBuildingLevel): MvpBuildingLevel | null {
  return level >= (stage === 'mvp' ? 5 : 3) ? null : (level + 1) as MvpBuildingLevel;
}
export function mvpAdditionalCapacityForLevel(level: MvpBuildingLevel): number {
  return level === 5 ? MVP_BUILDING_EXTENSION_PROOF_TUNING[5].capacityIncrease : 0;
}
export function mvpQualityBonusForLevel(level: MvpBuildingLevel): number {
  return level >= 4 ? MVP_BUILDING_EXTENSION_PROOF_TUNING[level as MvpExtensionLevel].qualityBonus : 0;
}
export function mvpWorkerSlotIncreaseOnUpgrade(toLevel: MvpBuildingLevel): number {
  return toLevel >= 4 ? MVP_BUILDING_EXTENSION_PROOF_TUNING[toLevel as MvpExtensionLevel].workerSlotsIncrease : 0;
}
