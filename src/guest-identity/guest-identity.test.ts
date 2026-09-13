import { describe, expect, it } from 'vitest';
import { confirmDuplicateProfile, grantGuestConsent, initialGuestIdentityState, mergeGuestProfiles, openIdentityReview, revokeMarketingConsent, verifyGuestIdentity, type IdentityRole } from './guest-identity';

const meta = (id: string, revision: number, actor: string, role: IdentityRole) => ({ id, expectedRevision: revision, actor: { id: actor, role } });

function merged() {
  let state = openIdentityReview(initialGuestIdentityState, { ...meta('open', 0, 'front-desk', 'Front Desk'), documentHash: 'a18b29c30d4e5f607182' });
  state = confirmDuplicateProfile(state, meta('confirm', 1, 'privacy', 'Privacy Officer'));
  return mergeGuestProfiles(state, meta('merge', 2, 'manager', 'Duty Manager'));
}

describe('guest identity and consent', () => {
  it('merges value, verifies the held reservation and preserves consent revocation', () => {
    let state = grantGuestConsent(merged(), { ...meta('consent', 3, 'GUEST-PRIMARY', 'Guest'), stayProcessing: true, marketing: true });
    state = verifyGuestIdentity(state, meta('verify', 4, 'front-desk', 'Front Desk'));
    state = revokeMarketingConsent(state, meta('revoke', 5, 'GUEST-PRIMARY', 'Guest'));
    expect(state.reservation.status).toBe('ready');
    expect(state.profiles[0]).toMatchObject({ status: 'active', loyaltyPoints: 900, completedStays: 4 });
    expect(state.profiles[1]).toMatchObject({ status: 'merged', loyaltyPoints: 0, completedStays: 0 });
    expect(state.consent).toMatchObject({ stayProcessing: true, marketing: false });
    expect(state.history).toHaveLength(5);
  });

  it('requires operational consent before reservation release', () => {
    expect(() => grantGuestConsent(merged(), { ...meta('consent', 3, 'GUEST-PRIMARY', 'Guest'), stayProcessing: false, marketing: true })).toThrow('Stay processing consent');
  });

  it('protects duplicate confirmation from a changed source profile', () => {
    const state = openIdentityReview(initialGuestIdentityState, { ...meta('open', 0, 'front-desk', 'Front Desk'), documentHash: 'a18b29c30d4e5f607182' });
    state.profiles[1]!.version += 1;
    expect(() => confirmDuplicateProfile(state, meta('confirm', 1, 'privacy', 'Privacy Officer'))).toThrow('Duplicate guest profile changed');
  });
});
