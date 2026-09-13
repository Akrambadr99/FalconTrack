export type IdentityRole = 'Front Desk' | 'Privacy Officer' | 'Duty Manager' | 'Guest';

export interface GuestIdentityState {
  revision: number;
  reservation: {
    id: string;
    version: number;
    status: 'identity-hold' | 'ready';
    guestId: string;
  };
  profiles: {
    id: string;
    version: number;
    email: string;
    status: 'pending' | 'active' | 'merged';
    loyaltyPoints: number;
    completedStays: number;
  }[];
  review: null | {
    id: string;
    status: 'opened' | 'duplicate-confirmed' | 'merged' | 'consented' | 'verified';
    reservationVersion: number;
    primaryVersion: number;
    duplicateVersion: number;
    documentHash: string;
    owner: string;
    privacyOfficer?: string;
    manager?: string;
  };
  consent: {
    version: number;
    stayProcessing: boolean;
    marketing: boolean;
    grantedBy?: string;
  };
  history: {
    id: string;
    kind: 'document' | 'merge' | 'consent-granted' | 'identity-verified' | 'consent-revoked';
    actor: string;
    detail: string;
    immutable: true;
  }[];
  events: { id: string; action: string; actor: string }[];
}

export const initialGuestIdentityState: GuestIdentityState = {
  revision: 0,
  reservation: { id: 'RES-IDENT-42', version: 5, status: 'identity-hold', guestId: 'GUEST-PRIMARY' },
  profiles: [
    { id: 'GUEST-PRIMARY', version: 3, email: 'guest@example.com', status: 'pending', loyaltyPoints: 200, completedStays: 1 },
    { id: 'GUEST-DUPLICATE', version: 4, email: 'Guest@example.com', status: 'active', loyaltyPoints: 700, completedStays: 3 },
  ],
  review: null,
  consent: { version: 1, stayProcessing: false, marketing: false },
  history: [],
  events: [],
};

interface Meta {
  id: string;
  expectedRevision: number;
  actor: { id: string; role: IdentityRole };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function primary(state: GuestIdentityState) {
  const profile = state.profiles.find((item) => item.id === state.reservation.guestId);
  assert(profile, 'Reservation guest profile is missing.');
  return profile;
}

function duplicate(state: GuestIdentityState) {
  const profile = state.profiles.find((item) => item.id === 'GUEST-DUPLICATE');
  assert(profile, 'Duplicate guest profile is missing.');
  return profile;
}

function current(state: GuestIdentityState) {
  assert(state.review, 'No guest identity review exists.');
  return state.review;
}

function begin(state: GuestIdentityState, command: Meta) {
  assert(state.revision === command.expectedRevision, 'Guest identity changed. Refresh before retrying.');
  assert(!state.events.some((event) => event.id === command.id), 'Command already applied.');
  return structuredClone(state);
}

function assertCurrent(state: GuestIdentityState) {
  const review = current(state);
  assert(review.reservationVersion === state.reservation.version, 'Reservation changed after identity review opened.');
  assert(review.primaryVersion === primary(state).version, 'Primary guest profile changed after identity review opened.');
  assert(review.duplicateVersion === duplicate(state).version, 'Duplicate guest profile changed after identity review opened.');
}

function finish(state: GuestIdentityState, command: Meta, action: string) {
  state.revision += 1;
  state.events.push({ id: command.id, action, actor: command.actor.id });
  return state;
}

export function openIdentityReview(state: GuestIdentityState, command: Meta & { documentHash: string }) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can open identity review.');
  const next = begin(state, command);
  assert(!next.review && next.reservation.status === 'identity-hold', 'Held reservation without a review is required.');
  assert(/^[a-f0-9]{20}$/.test(command.documentHash), 'Document hash must contain twenty lowercase hexadecimal characters.');
  const main = primary(next), match = duplicate(next);
  assert(main.email.toLowerCase() === match.email.toLowerCase(), 'Seeded profiles do not represent a duplicate candidate.');
  next.review = { id: `${command.id}-review`, status: 'opened', reservationVersion: next.reservation.version, primaryVersion: main.version, duplicateVersion: match.version, documentHash: command.documentHash, owner: command.actor.id };
  next.history.push({ id: `${command.id}-document`, kind: 'document', actor: command.actor.id, detail: command.documentHash, immutable: true });
  return finish(next, command, 'identity-review-opened');
}

export function confirmDuplicateProfile(state: GuestIdentityState, command: Meta) {
  assert(command.actor.role === 'Privacy Officer', 'Only privacy officers can confirm duplicate profiles.');
  const next = begin(state, command), review = current(next);
  assert(review.status === 'opened' && command.actor.id !== review.owner, 'Independent open identity review is required.');
  assertCurrent(next);
  review.status = 'duplicate-confirmed';
  review.privacyOfficer = command.actor.id;
  return finish(next, command, 'duplicate-profile-confirmed');
}

export function mergeGuestProfiles(state: GuestIdentityState, command: Meta) {
  assert(command.actor.role === 'Duty Manager', 'Only duty managers can merge guest profiles.');
  const next = begin(state, command), review = current(next);
  assert(review.status === 'duplicate-confirmed', 'Privacy-confirmed duplicate is required.');
  assert(command.actor.id !== review.owner && command.actor.id !== review.privacyOfficer, 'Profile merge approval must be independent.');
  assertCurrent(next);
  const main = primary(next), match = duplicate(next);
  main.loyaltyPoints += match.loyaltyPoints;
  main.completedStays += match.completedStays;
  main.version += 1;
  match.loyaltyPoints = 0;
  match.completedStays = 0;
  match.status = 'merged';
  match.version += 1;
  review.primaryVersion = main.version;
  review.duplicateVersion = match.version;
  review.status = 'merged';
  review.manager = command.actor.id;
  next.history.push({ id: `${command.id}-merge`, kind: 'merge', actor: command.actor.id, detail: `${match.id}->${main.id}`, immutable: true });
  return finish(next, command, 'guest-profiles-merged');
}

export function grantGuestConsent(state: GuestIdentityState, command: Meta & { stayProcessing: boolean; marketing: boolean }) {
  assert(command.actor.role === 'Guest' && command.actor.id === state.reservation.guestId, 'Reservation guest must grant consent.');
  const next = begin(state, command), review = current(next);
  assert(review.status === 'merged', 'Merged identity review is required before consent.');
  assertCurrent(next);
  assert(command.stayProcessing, 'Stay processing consent is required to release the reservation.');
  next.consent.stayProcessing = true;
  next.consent.marketing = command.marketing;
  next.consent.grantedBy = command.actor.id;
  next.consent.version += 1;
  review.status = 'consented';
  next.history.push({ id: `${command.id}-consent`, kind: 'consent-granted', actor: command.actor.id, detail: command.marketing ? 'stay,marketing' : 'stay', immutable: true });
  return finish(next, command, 'guest-consent-granted');
}

export function verifyGuestIdentity(state: GuestIdentityState, command: Meta) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can verify guest identity.');
  const next = begin(state, command), review = current(next);
  assert(review.status === 'consented' && command.actor.id === review.owner, 'Opening front-desk owner must complete verification.');
  assertCurrent(next);
  assert(next.consent.stayProcessing && next.consent.grantedBy === next.reservation.guestId, 'Current guest stay consent is required.');
  const main = primary(next);
  main.status = 'active';
  main.version += 1;
  review.primaryVersion = main.version;
  next.reservation.status = 'ready';
  next.reservation.version += 1;
  review.reservationVersion = next.reservation.version;
  review.status = 'verified';
  next.history.push({ id: `${command.id}-verified`, kind: 'identity-verified', actor: command.actor.id, detail: next.reservation.id, immutable: true });
  return finish(next, command, 'guest-identity-verified');
}

export function revokeMarketingConsent(state: GuestIdentityState, command: Meta) {
  assert(command.actor.role === 'Guest' && command.actor.id === state.reservation.guestId, 'Reservation guest must revoke consent.');
  const next = begin(state, command), review = current(next);
  assert(review.status === 'verified' && next.consent.marketing, 'Verified guest with active marketing consent is required.');
  assertCurrent(next);
  next.consent.marketing = false;
  next.consent.version += 1;
  next.history.push({ id: `${command.id}-revoked`, kind: 'consent-revoked', actor: command.actor.id, detail: 'marketing', immutable: true });
  return finish(next, command, 'marketing-consent-revoked');
}

export class GuestIdentityRepository {
  static key = 'staypilot:guest-identity:v1';
  private storage: Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage; }
  read() { const raw = this.storage.getItem(GuestIdentityRepository.key); return raw ? JSON.parse(raw) as GuestIdentityState : structuredClone(initialGuestIdentityState); }
  commit(expectedRevision: number, operation: (state: GuestIdentityState) => GuestIdentityState) { const state = this.read(); assert(state.revision === expectedRevision, 'Another session changed guest identity. Refresh before retrying.'); const next = operation(state); this.storage.setItem(GuestIdentityRepository.key, JSON.stringify(next)); return next; }
}
