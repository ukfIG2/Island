import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, prototypeAreaUnlockView, PROTOTYPE_AREA_PROOF_TUNING, MVP_AREA_REPUTATION_PROVISIONAL } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

describe('FR-049: two-step unlocks across Prototype and MVP', () => {
  it('uses MVP Reputation rather than wave count to expose Pool purchase', () => {
    const req=MVP_AREA_REPUTATION_PROVISIONAL.pool, cost=PROTOTYPE_AREA_PROOF_TUNING.pool;
    expect(req).toBeGreaterThan(0);
    const initial={...createInitialBootstrapState('fr049-pool',undefined,'mvp'),coins:cost+12};
    expect(initial.currentWaveNumber).toBe(1);
    expect(prototypeAreaUnlockView(initial,'pool').status).toBe('locked');
    const below={...initial,reputation:req-1};
    expect(dispatch(below,{type:'PURCHASE_AREA',areaId:'pool'})).toBe(below);
    const earned={...initial,reputation:req};
    expect(prototypeAreaUnlockView(earned,'pool').status).toBe('available');
    const poor={...earned,coins:cost-1};
    expect(prototypeAreaUnlockView(poor,'pool').status).toBe('not_affordable');
    expect(dispatch(poor,{type:'PURCHASE_AREA',areaId:'pool'})).toBe(poor);
    const paid=dispatch(earned,{type:'PURCHASE_AREA',areaId:'pool'});
    expect(paid.purchasedAreas.pool).toBe(true);
    expect(paid.coins).toBe(12);
    expect(paid.reputation).toBe(req);
    expect(prototypeAreaUnlockView(paid,'pool').status).toBe('unlocked');
    expect(dispatch(paid,{type:'PURCHASE_AREA',areaId:'pool'})).toBe(paid);
    const restored=normalizePersistedState(JSON.parse(JSON.stringify(paid)));
    expect(restored.purchasedAreas.pool).toBe(true);
    expect(restored.reputation).toBe(req);
  });
  it('gates Bungalows on its own cumulative MVP threshold regardless of early waves', () => {
    const req=MVP_AREA_REPUTATION_PROVISIONAL.bungalows, cost=PROTOTYPE_AREA_PROOF_TUNING.bungalows;
    expect(req).toBeGreaterThan(MVP_AREA_REPUTATION_PROVISIONAL.pool);
    const mvp={...createInitialBootstrapState('fr049-bungalow',undefined,'mvp'),coins:cost+30,reputation:req-1};
    expect(prototypeAreaUnlockView(mvp,'bungalows').status).toBe('locked');
    expect(dispatch(mvp,{type:'PURCHASE_AREA',areaId:'bungalows'})).toBe(mvp);
    const reached={...mvp,reputation:req};
    expect(reached.currentWaveNumber).toBe(1);
    expect(prototypeAreaUnlockView(reached,'bungalows').status).toBe('available');
    const purchased=dispatch(reached,{type:'PURCHASE_AREA',areaId:'bungalows'});
    expect(purchased.purchasedAreas.bungalows).toBe(true);
    expect(purchased.coins).toBe(30);
    expect(purchased.reputation).toBe(req);
  });
  it('keeps fixed Prototype milestones binding even when Reputation is arbitrarily high', () => {
    const proto={...createInitialBootstrapState('fr049-proto'),reputation:999,coins:100};
    expect(prototypeAreaUnlockView(proto,'pool').status).toBe('locked');
    expect(prototypeAreaUnlockView(proto,'bungalows').status).toBe('locked');
    expect(dispatch(proto,{type:'PURCHASE_AREA',areaId:'pool'})).toBe(proto);
    expect(dispatch(proto,{type:'PURCHASE_AREA',areaId:'bungalows'})).toBe(proto);
  });
});
