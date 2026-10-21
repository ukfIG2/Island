/// <reference types="vite/client" />
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import { AreaUnlockMap } from './AreaUnlockMap';
import { applyBootstrapCommand, createInitialBootstrapState, prototypeAreaUnlockView, type BootstrapState } from '../core/state';

const initial = (stage: 'prototype' | 'mvp' = 'prototype') => createInitialBootstrapState('fr060-' + stage, undefined, stage);
const ready = (): BootstrapState => ({ ...initial(), currentWaveNumber: 4, coins: 100 });
const markup = (state: BootstrapState) => renderToStaticMarkup(createElement(AreaUnlockMap, { state, onSelectNeed: () => {}, onPurchase: () => {} }));

describe('FR-060 map-accessible Area Unlock', () => {
  it('exposes locked, available, not-affordable and unlocked Core states with content, Worker and Coin pricing', () => {
    expect(prototypeAreaUnlockView(initial(), 'pool').status).toBe('locked');
    expect(markup(initial())).toContain('data-status="locked"');
    const funded = ready();
    expect(prototypeAreaUnlockView(funded, 'pool').status).toBe('available');
    expect(markup(funded)).toContain('data-status="available"');
    expect(markup(funded)).toContain('data-area="bungalows"');
    expect(markup(funded)).toContain('included Worker worker-2');
    expect(markup(funded)).toContain('Price: 10 Coins');
    const poor = { ...funded, coins: 0 };
    expect(prototypeAreaUnlockView(poor, 'pool').status).toBe('not_affordable');
    expect(markup(poor)).toContain('data-status="not_affordable"');
    const bought = applyBootstrapCommand(funded, { type: 'PURCHASE_AREA', areaId: 'pool' });
    expect(bought.purchasedAreas.pool).toBe(true);
    expect(bought.coins).toBe(funded.coins - 10);
    expect(bought.normalWave.workerAssignments['worker-2']).toBe('relax');
    expect(markup(bought)).toContain('data-status="unlocked"');
  });
  it('retains a deferred available unlock while a wave is active but forbids spending until permitted', () => {
    const funded = ready();
    const active: BootstrapState = { ...funded, normalWave: { ...funded.normalWave, phase: 'incoming' } };
    expect(prototypeAreaUnlockView(active, 'pool').status).toBe('available');
    const view = markup(active);
    expect(view).toContain('Area unlocks on resort map');
    expect(view).toMatch(/data-purchase-area="pool" disabled=""/);
    expect(view).toContain('(between waves)');
    expect(markup(funded)).not.toMatch(/data-purchase-area="pool" disabled=""/);
    expect(appSource).toContain('<AreaUnlockMap state={snapshot}');
    expect(appSource).toContain("onPurchase={(areaId) => core.dispatch({ type: 'PURCHASE_AREA', areaId })}");
  });
  it('communicates MVP Reputation thresholds without replacing stage-specific eligibility', () => {
    const view = markup(initial('mvp'));
    expect(view).toContain('Requires 5 Reputation');
    expect(view).toContain('Requires 15 Reputation');
    expect(view).toContain('included Worker worker-3');
    expect(view).toContain('Price: 20 Coins');
  });
});
