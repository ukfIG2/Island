import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, MVP_VIP_COMPLETION_MATERIALS_PROVISIONAL, type BootstrapState } from './state';
import { MVP_VIP_PROVISIONAL_TIMING, MVP_VIP_TYPES, type MvpVipType } from './vipLayer';
import { MVP_VIP_PREVIEW_PROOF_CATALOG } from './vipPreview';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

function ready(type: MvpVipType): BootstrapState {
 const base = createInitialBootstrapState('fr051-' + type, undefined, 'mvp');
 const profile = MVP_VIP_PREVIEW_PROOF_CATALOG[type];
 return { ...base, hiredSpecialists: [...profile.specialists], purchasedAreas: { pool: true, bungalows: true }, vipBuildings: { spa: true }, normalWave: { ...base.normalWave, hiredManagers: { ...base.normalWave.hiredManagers, ...Object.fromEntries(profile.managers.map(id => [id, true])) } } };
}
const start = (s: BootstrapState, type: MvpVipType) => dispatch(s, { type: 'BEGIN_VIP_VISIT', vipType: type });
const finish = (s: BootstrapState) => dispatch(s, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });

describe('FR-051 Materials acquisition from completed VIP play', () => {
 it.each(MVP_VIP_TYPES)('%s awards once on actual completion', type => {
  const initial = ready(type), begun = start(initial, type);
  expect(begun.materials).toBe(initial.materials);
  const completed = finish(begun);
  expect(completed.vipLayer.active).toBeNull();
  expect(completed.materials - initial.materials).toBe(MVP_VIP_COMPLETION_MATERIALS_PROVISIONAL.perVisit);
  expect(completed.lastVipReward?.materials).toBe(MVP_VIP_COMPLETION_MATERIALS_PROVISIONAL.perVisit);
  const later = dispatch(completed, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(later.materials).toBe(completed.materials);
  expect(later.lastVipReward).toEqual(completed.lastVipReward);
 });
 it('also awards exactly once at Energy speed-up completion', () => {
  let s = start({ ...ready('travelBlogger'), energy: 60 }, 'travelBlogger');
  for(let i=0;i<55 && s.vipLayer.active !== null;i++){
   const next = dispatch(s, { type: 'VIP_SPEED_UP' });
   if(next.vipLayer.active !== null)expect(next.materials).toBe(0);
   s = next;
  }
  expect(s.vipLayer.active).toBeNull();
  expect(s.materials).toBe(MVP_VIP_COMPLETION_MATERIALS_PROVISIONAL.perVisit);
  expect(dispatch(s,{type:'ADVANCE_SIMULATION',deltaMs:1000}).materials).toBe(s.materials);
 });
 it('awards exactly once per distinct completed VIP visit', () => {
  const initial=ready('investor');
  const first=finish(start(initial,'investor'));
  expect(first.vipLayer.completed).toEqual(['investor']);
  expect(first.materials).toBe(initial.materials+MVP_VIP_COMPLETION_MATERIALS_PROVISIONAL.perVisit);
  const between=dispatch(first,{type:'ADVANCE_SIMULATION',deltaMs:1000});
  expect(between.materials).toBe(first.materials);
  const second=finish(start(between,'investor'));
  expect(second.vipLayer.completed).toEqual(['investor','investor']);
  expect(second.materials).toBe(initial.materials+2*MVP_VIP_COMPLETION_MATERIALS_PROVISIONAL.perVisit);
  expect(second.lastVipReward?.completedVisitCount).toBe(2);
  expect(second.lastVipReward?.materials).toBe(MVP_VIP_COMPLETION_MATERIALS_PROVISIONAL.perVisit);
  expect(dispatch(second,{type:'ADVANCE_SIMULATION',deltaMs:1000}).materials).toBe(second.materials);
 });
 it('roundtrips earned balance and reward receipt through persistence', () => {
  const paid=finish(start(ready('investor'),'investor'));
  const restored=normalizePersistedState(JSON.parse(JSON.stringify(paid)) as BootstrapState);
  expect(restored.materials).toBe(paid.materials);
  expect(restored.lastVipReward).toEqual(paid.lastVipReward);
  expect(dispatch(restored,{type:'ADVANCE_SIMULATION',deltaMs:1000}).materials).toBe(paid.materials);
 });
 it('normalizes legacy receipts without retroactive rewards', () => {
  const paid=finish(start(ready('investor'),'investor'));
  const old={...paid,materials:0,lastVipReward:{...paid.lastVipReward,materials:undefined}} as unknown as BootstrapState;
  const restored=normalizePersistedState(old);
  expect(restored.materials).toBe(0);
  expect(restored.lastVipReward?.materials).toBe(0);
  expect(dispatch(restored,{type:'ADVANCE_SIMULATION',deltaMs:1000}).materials).toBe(0);
 });
 it('does not award VIP Materials from Prototype or ordinary waves', () => {
  const prototype=createInitialBootstrapState('fr051-prototype',undefined,'prototype');
  expect(() => start(prototype,'investor')).toThrow('MVP_VIP_STAGE_INVALID');
  let wave=dispatch(ready('investor'),{type:'START_WAVE'});
  for(let i=0;i<12 && wave.normalWave.phase!=='complete';i++)wave=dispatch(wave,{type:'ADVANCE_SIMULATION',deltaMs:90000});
  expect(wave.normalWave.phase).toBe('complete');
  expect(wave.materials).toBe(0);
 });
});
