import { MVP_MANAGER_CATALOG, MVP_SPECIALIST_CATALOG, MVP_VIP_SPA_BUILDING, PROTOTYPE_AREA_CATALOG, type BootstrapState, type MvpSpecialistId } from './state';
import { MVP_VIP_CATALOG, type MvpVipType } from './vipLayer';
type ManagerId = keyof BootstrapState['normalWave']['hiredManagers'];
type AreaId = keyof BootstrapState['purchasedAreas'];
interface Profile { readonly opportunity: string; readonly minimum: number; readonly maximum: number; readonly specialists: readonly MvpSpecialistId[]; readonly managers: readonly ManagerId[]; readonly areas: readonly AreaId[]; readonly vipBuildings: readonly (keyof BootstrapState['vipBuildings'])[]; }
/** Illustrative MVP preview tuning: neither reward values nor prerequisite pairings are fixed by FINAL(3). No actual VIP payout is implemented yet. */
export const MVP_VIP_PREVIEW_PROOF_CATALOG: Readonly<Record<MvpVipType, Profile>> = {
  travelBlogger: { opportunity: 'Resort travel feature', minimum: 40, maximum: 80, specialists: ['photographer'], managers: [], areas: ['pool'], vipBuildings: [] },
  weddingCouple: { opportunity: 'Destination wedding celebration', minimum: 70, maximum: 130, specialists: ['eventPlanner'], managers: [], areas: ['bungalows'], vipBuildings: ['spa'] },
  investor: { opportunity: 'Resort investment showcase', minimum: 60, maximum: 120, specialists: [], managers: ['reception'], areas: ['bungalows'], vipBuildings: [] },
  influencer: { opportunity: 'Resort social-media campaign', minimum: 45, maximum: 95, specialists: ['publicist'], managers: [], areas: ['pool'], vipBuildings: ['spa'] }
};
export interface MvpVipPreviewInfo {
  readonly vipType: MvpVipType; readonly identity: string; readonly opportunity: string;
  readonly potentialReward: { readonly resource: 'Reputation'; readonly minimum: number; readonly maximum: number; readonly provisional: true; readonly awardImplemented: true };
  readonly readiness: 'prepared' | 'gaps'; readonly rosterGaps: readonly string[]; readonly buildingGaps: readonly string[];
}
/** Pure read-only projection based on prior resort investments, never normal-wave Worker allocation. */
export function deriveMvpVipPreviewInfo(state: BootstrapState, vipType: MvpVipType): MvpVipPreviewInfo {
  if (state.progressionStage !== 'mvp') throw Error('MVP_VIP_PREVIEW_STAGE_INVALID');
  const proof = MVP_VIP_PREVIEW_PROOF_CATALOG[vipType];
  if (!proof) throw Error('MVP_VIP_PREVIEW_UNKNOWN');
  const rosterGaps = [
    ...proof.specialists.filter(id => !state.hiredSpecialists.includes(id)).map(id => MVP_SPECIALIST_CATALOG[id].role),
    ...proof.managers.filter(id => state.normalWave.hiredManagers[id] !== true).map(id => 'Manager: ' + MVP_MANAGER_CATALOG[id].name)
  ];
  const buildingGaps = [
  ...proof.areas.filter(id => !state.purchasedAreas[id]).map(id => PROTOTYPE_AREA_CATALOG[id].buildingLabel),
  ...proof.vipBuildings.filter(id => !state.vipBuildings[id]).map(id => id === 'spa' ? MVP_VIP_SPA_BUILDING.label : id)
 ];
  return { vipType, identity: MVP_VIP_CATALOG[vipType].label, opportunity: proof.opportunity, potentialReward: { resource: 'Reputation', minimum: proof.minimum, maximum: proof.maximum, provisional: true, awardImplemented: true }, readiness: rosterGaps.length || buildingGaps.length ? 'gaps' : 'prepared', rosterGaps, buildingGaps };
}
