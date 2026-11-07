import { describe, expect, it } from 'vitest';
import { guestShouldTraverseArrivalRoute as follows } from './pmoGuestMotion';

describe('PMO guest arrival projection', () => {
  it('uses an existing certified route for active guests', () => {
    expect(follows('active', true, 2)).toBe(true);
    expect(follows('active', true, 7)).toBe(true);
  });
  it('fails closed when there is no usable route or PMO is disabled', () => {
    expect(follows('active', true, 0)).toBe(false);
    expect(follows('active', true, 1)).toBe(false);
    expect(follows('active', false, 7)).toBe(false);
    expect(follows('served', true, 7)).toBe(false);
  });
  it('preserves the existing queue path in both world modes', () => {
    expect(follows('queue', true, 2)).toBe(true);
    expect(follows('queue', false, 2)).toBe(true);
  });
});
