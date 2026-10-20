/** FR-036 MVP parallel VIP domain. Timing is provisional implementation tuning, not canonical balance. */
export const MVP_VIP_TYPES = ['travelBlogger', 'weddingCouple', 'investor', 'influencer'] as const;
export type MvpVipType = (typeof MVP_VIP_TYPES)[number];
export const MVP_VIP_CATALOG: Readonly<Record<MvpVipType, { readonly label: string }>> = {
  travelBlogger: { label: 'Travel Blogger' },
  weddingCouple: { label: 'Wedding Couple' },
  investor: { label: 'Investor' },
  influencer: { label: 'Influencer' }
};
export const MVP_VIP_PROVISIONAL_TIMING = { visitDurationMs: 30_000 } as const;
export interface MvpVipPreparedness { readonly readiness: 'prepared' | 'gaps'; readonly rosterGaps: readonly string[]; readonly buildingGaps: readonly string[]; }
/** Provisional 1–5 quality scale. FINAL(3) binds a reduced ceiling, not penalty magnitudes. */
export const MVP_VIP_QUALITY_CEILING_PROVISIONAL = { maximum: 5, minimum: 1, perRosterGap: 1, perBuildingGap: 1 } as const;
/** The immutable visit-start snapshot is the only authority for its attainable quality. */
export function mvpVipAttainableQualityCeiling(preparedness: MvpVipPreparedness | undefined): number | null {
 if (!preparedness) return null;
 const t = MVP_VIP_QUALITY_CEILING_PROVISIONAL;
 const penalty = preparedness.rosterGaps.length * t.perRosterGap + preparedness.buildingGaps.length * t.perBuildingGap;
 return Math.max(t.minimum, t.maximum - penalty);
}
/** All future nominal quality scoring must obey this cap; legacy unknown is not treated as full quality. */
export function capMvpVipQuality(nominal: number, preparedness: MvpVipPreparedness | undefined): number | null {
 if (!Number.isInteger(nominal) || nominal < 1 || nominal > MVP_VIP_QUALITY_CEILING_PROVISIONAL.maximum) throw new Error('MVP_VIP_QUALITY_INVALID');
 const ceiling = mvpVipAttainableQualityCeiling(preparedness);
 return ceiling === null ? null : Math.min(nominal, ceiling);
}
export interface MvpVipVisit { readonly type: MvpVipType; readonly elapsedMs: number; readonly preparedness?: MvpVipPreparedness; }
export interface MvpVipResolution { readonly type: MvpVipType; readonly preparedness: MvpVipPreparedness; }
export type MvpVipPreviewDecision = 'maybeLater' | 'declined' | null;
export interface MvpVipLayerState { readonly active: MvpVipVisit | null; readonly completed: readonly MvpVipType[]; readonly preview: MvpVipType | null; readonly accepted: MvpVipType | null; readonly requestsOpen: boolean; readonly consumableReady: boolean; readonly lastPreviewDecision: MvpVipPreviewDecision; readonly resolutions: readonly MvpVipResolution[]; }
/** FR-042: canonical request card phases; ceiling is orthogonal to lifecycle. */
export type MvpVipRequestStatus = 'MISSING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED';
export interface MvpVipRequestCard { readonly key: string; readonly vipType: MvpVipType; readonly status: MvpVipRequestStatus; readonly attainableQualityCeiling: number | null; }
/** Read-only projection: no duplicate writable lifecycle state or speculative rewards. */
export function deriveMvpVipRequestCards(layer: MvpVipLayerState): readonly MvpVipRequestCard[] {
 const cards: MvpVipRequestCard[] = [];
 // Historical resolution indices are reliable only when every completion has a matching snapshot.
 const fullyAligned = layer.completed.length === layer.resolutions.length && layer.completed.every((type, index) => layer.resolutions[index].type === type);
 for (let index = 0; index < layer.completed.length; index++) {
  cards.push({ key: 'completed-' + index, vipType: layer.completed[index], status: 'COMPLETED', attainableQualityCeiling: fullyAligned ? mvpVipAttainableQualityCeiling(layer.resolutions[index].preparedness) : null });
 }
 if (layer.active !== null) cards.push({ key: 'active', vipType: layer.active.type, status: 'IN_PROGRESS', attainableQualityCeiling: mvpVipAttainableQualityCeiling(layer.active.preparedness) });
 if (layer.accepted !== null && layer.requestsOpen) cards.push({ key: 'accepted', vipType: layer.accepted, status: layer.consumableReady ? 'READY' : 'MISSING', attainableQualityCeiling: null });
 return cards;
}
export function initialMvpVipLayer(): MvpVipLayerState { return { active: null, completed: [], preview: null, accepted: null, requestsOpen: false, consumableReady: false, lastPreviewDecision: null, resolutions: [] }; }
export function isMvpVipType(id: unknown): id is MvpVipType { return typeof id === 'string' && MVP_VIP_TYPES.includes(id as MvpVipType); }
function normalizePreparedness(value: unknown): MvpVipPreparedness | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Partial<MvpVipPreparedness>;
  if ((p.readiness !== 'prepared' && p.readiness !== 'gaps') || !Array.isArray(p.rosterGaps) || !p.rosterGaps.every(x => typeof x === 'string') || !Array.isArray(p.buildingGaps) || !p.buildingGaps.every(x => typeof x === 'string')) return null;
  return { readiness: p.readiness, rosterGaps: [...p.rosterGaps], buildingGaps: [...p.buildingGaps] };
}
export function normalizeMvpVipLayer(value: unknown): MvpVipLayerState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return initialMvpVipLayer();
  const candidate = value as Partial<MvpVipLayerState>;
  if (!Array.isArray(candidate.completed) || !candidate.completed.every(isMvpVipType)) return initialMvpVipLayer();
  const visit = candidate.active;
  if (visit !== null && (visit === undefined || !isMvpVipType(visit.type) || !Number.isFinite(visit.elapsedMs) || visit.elapsedMs < 0)) return initialMvpVipLayer();
  const preparedness = visit ? normalizePreparedness(visit.preparedness) : null;
  const active = visit ? { type: visit.type, elapsedMs: visit.elapsedMs, ...(preparedness ? { preparedness } : {}) } : null;
  const preview = candidate.preview ?? null, accepted = candidate.accepted ?? null;
  if ((preview !== null && !isMvpVipType(preview)) || (accepted !== null && !isMvpVipType(accepted))) return initialMvpVipLayer();
  const resolutions: MvpVipResolution[] = [];
  if (Array.isArray(candidate.resolutions)) for (const item of candidate.resolutions) {
    if (!item || typeof item !== 'object' || !isMvpVipType(item.type)) continue;
    const snapshot = normalizePreparedness(item.preparedness);
    if (snapshot) resolutions.push({ type: item.type, preparedness: snapshot });
  }
  const requestsOpen = accepted !== null && candidate.requestsOpen === true;
  const consumableReady = requestsOpen && candidate.consumableReady === true;
const lastPreviewDecision = candidate.lastPreviewDecision === 'maybeLater' || candidate.lastPreviewDecision === 'declined' ? candidate.lastPreviewDecision : null;
  const activeCanonical = visit !== undefined && (visit === null || visit.preparedness === undefined || normalizePreparedness(visit.preparedness) !== null);
  const resolutionsCanonical = Array.isArray(candidate.resolutions) && candidate.resolutions.length === resolutions.length;
  if (activeCanonical && resolutionsCanonical && candidate.preview === preview && candidate.accepted === accepted && candidate.requestsOpen === requestsOpen && candidate.consumableReady === consumableReady && candidate.lastPreviewDecision === lastPreviewDecision) return value as MvpVipLayerState;
  return { active, completed: [...candidate.completed], preview, accepted, requestsOpen, consumableReady, lastPreviewDecision, resolutions };
}
export function showMvpVipPreview(layer: MvpVipLayerState, type: MvpVipType): MvpVipLayerState {
  if (!isMvpVipType(type)) throw new Error('MVP_VIP_UNKNOWN');
  if (layer.active !== null || layer.accepted !== null) throw new Error('MVP_VIP_PREVIEW_UNAVAILABLE');
  return { ...layer, preview: type, lastPreviewDecision: null };
}
export function decideMvpVipPreview(layer: MvpVipLayerState, decision: 'accept' | 'maybeLater' | 'declined'): MvpVipLayerState {
  if (layer.preview === null) throw new Error('MVP_VIP_PREVIEW_REQUIRED');
  if (decision === 'accept') return { ...layer, accepted: layer.preview, preview: null, requestsOpen: true, consumableReady: false, lastPreviewDecision: null };
  return { ...layer, preview: null, lastPreviewDecision: decision };
}
/** Resolve the consumable-only requirement; Materials debit occurs atomically in the core command boundary. */
export function markMvpVipConsumableReady(layer: MvpVipLayerState): MvpVipLayerState {
 if (layer.accepted === null || !layer.requestsOpen || layer.consumableReady) throw new Error('MVP_VIP_CONSUMABLE_FIX_UNAVAILABLE');
 return { ...layer, consumableReady: true };
}
export function beginMvpVipVisit(layer: MvpVipLayerState, type: MvpVipType, preparedness?: MvpVipPreparedness): MvpVipLayerState {
  if (!isMvpVipType(type)) throw new Error('MVP_VIP_UNKNOWN');
  if (layer.active !== null) throw new Error('MVP_VIP_ALREADY_ACTIVE');
  return { ...layer, active: { type, elapsedMs: 0, ...(preparedness ? { preparedness: { readiness: preparedness.readiness, rosterGaps: [...preparedness.rosterGaps], buildingGaps: [...preparedness.buildingGaps] } } : {}) }, accepted: null, preview: null, requestsOpen: false, consumableReady: false };
}
export function advanceMvpVipLayer(layer: MvpVipLayerState, deltaMs: number): MvpVipLayerState {
  if (layer.active === null) return layer;
  const elapsedMs = layer.active.elapsedMs + deltaMs;
  if (elapsedMs >= MVP_VIP_PROVISIONAL_TIMING.visitDurationMs) return { ...layer, active: null, completed: [...layer.completed, layer.active.type], resolutions: layer.active.preparedness ? [...layer.resolutions, { type: layer.active.type, preparedness: layer.active.preparedness }] : layer.resolutions };
  return { ...layer, active: { ...layer.active, elapsedMs } };
}
