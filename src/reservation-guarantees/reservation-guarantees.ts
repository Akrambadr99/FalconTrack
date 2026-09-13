export type GuaranteeRole = 'Reservations Agent' | 'Guest' | 'Revenue Manager' | 'Finance' | 'Front Desk';
export interface GuaranteeState {
  revision: number;
  reservation: { id: string; version: number; guestId: string; status: 'inquiry' | 'held' | 'guaranteed' | 'confirmed' | 'cancellation-requested' | 'refunded' | 'cancelled'; arrivalDate: string; total: number };
  inventory: { roomType: string; version: number; available: number; held: number; confirmed: number };
  policy: { version: number; cancellationDeadline: string; depositPercent: number };
  guarantee: null | { status: 'held' | 'authorized' | 'confirmed' | 'cancellation-requested' | 'refunded' | 'cancelled'; holder: string; paymentAuthorization: string | null; reservationVersion: number; inventoryVersion: number; policyVersion: number; refundableAmount: number };
  ledger: { id: string; kind: 'authorization' | 'refund'; amount: number; reference: string; immutable: true }[];
  events: { id: string; action: string; actor: string; immutable: true }[];
}
export const initialGuaranteeState: GuaranteeState = {
  revision: 0,
  reservation: { id: 'RES-204', version: 3, guestId: 'GUEST-204', status: 'inquiry', arrivalDate: '2026-10-10', total: 1200 },
  inventory: { roomType: 'Deluxe King', version: 7, available: 2, held: 0, confirmed: 0 },
  policy: { version: 2, cancellationDeadline: '2026-10-08T18:00:00.000Z', depositPercent: 25 },
  guarantee: null,
  ledger: [],
  events: [],
};
interface Meta { id: string; expectedRevision: number; actor: { id: string; role: GuaranteeRole } }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function begin(state: GuaranteeState, command: Meta) { assert(state.revision === command.expectedRevision, 'Reservation guarantee changed. Refresh before retrying.'); assert(!state.events.some((event) => event.id === command.id), 'Guarantee command already applied.'); return structuredClone(state); }
function current(state: GuaranteeState) { assert(state.guarantee, 'No reservation guarantee exists.'); return state.guarantee; }
function assertCurrent(state: GuaranteeState) { const guarantee = current(state); assert(guarantee.reservationVersion === state.reservation.version, 'Reservation changed after guarantee processing began.'); assert(guarantee.inventoryVersion === state.inventory.version, 'Room inventory changed after guarantee processing began.'); assert(guarantee.policyVersion === state.policy.version, 'Cancellation policy changed after guarantee processing began.'); }
function sync(state: GuaranteeState) { const guarantee = current(state); guarantee.reservationVersion = state.reservation.version; guarantee.inventoryVersion = state.inventory.version; guarantee.policyVersion = state.policy.version; }
function finish(state: GuaranteeState, command: Meta, action: string) { state.revision += 1; state.events.push({ id: command.id, action, actor: command.actor.id, immutable: true }); return state; }

export function holdReservationInventory(state: GuaranteeState, command: Meta) {
  assert(command.actor.role === 'Reservations Agent', 'Only reservations agents can hold room inventory.');
  const next = begin(state, command);
  assert(!next.guarantee && next.reservation.status === 'inquiry' && next.inventory.available > 0, 'Available inventory and a new inquiry are required.');
  next.inventory.available -= 1; next.inventory.held += 1; next.inventory.version += 1;
  next.reservation.status = 'held'; next.reservation.version += 1;
  next.guarantee = { status: 'held', holder: command.actor.id, paymentAuthorization: null, reservationVersion: next.reservation.version, inventoryVersion: next.inventory.version, policyVersion: next.policy.version, refundableAmount: 0 };
  return finish(next, command, 'reservation-inventory-held');
}
export function authorizeReservationDeposit(state: GuaranteeState, command: Meta & { amount: number; authorization: string }) {
  assert(command.actor.role === 'Guest' && command.actor.id === state.reservation.guestId, 'Only the reservation guest can authorize the deposit.');
  const next = begin(state, command), guarantee = current(next);
  assert(guarantee.status === 'held', 'Held reservation inventory is required.'); assertCurrent(next);
  const required = next.reservation.total * next.policy.depositPercent / 100;
  assert(command.amount === required && command.authorization === 'AUTH-RES-204', 'The exact verified reservation deposit is required.');
  guarantee.status = 'authorized'; guarantee.paymentAuthorization = command.authorization; guarantee.refundableAmount = command.amount;
  next.reservation.status = 'guaranteed'; next.reservation.version += 1;
  next.ledger.push({ id: `${command.id}-authorization`, kind: 'authorization', amount: command.amount, reference: command.authorization, immutable: true });
  sync(next); return finish(next, command, 'reservation-deposit-authorized');
}
export function confirmGuaranteedReservation(state: GuaranteeState, command: Meta) {
  assert(command.actor.role === 'Revenue Manager', 'Only revenue managers can confirm guaranteed reservations.');
  const next = begin(state, command), guarantee = current(next);
  assert(guarantee.status === 'authorized' && guarantee.paymentAuthorization, 'An authorized deposit is required.'); assertCurrent(next);
  next.inventory.held -= 1; next.inventory.confirmed += 1; next.inventory.version += 1;
  next.reservation.status = 'confirmed'; next.reservation.version += 1; guarantee.status = 'confirmed'; sync(next);
  return finish(next, command, 'guaranteed-reservation-confirmed');
}
export function requestTimelyCancellation(state: GuaranteeState, command: Meta & { requestedAt: string }) {
  assert(command.actor.role === 'Guest' && command.actor.id === state.reservation.guestId, 'Only the reservation guest can request cancellation.');
  const next = begin(state, command), guarantee = current(next);
  assert(guarantee.status === 'confirmed', 'A confirmed guarantee is required.'); assertCurrent(next);
  assert(command.requestedAt === '2026-10-08T12:00:00.000Z' && command.requestedAt < next.policy.cancellationDeadline, 'Cancellation is outside the refundable policy window.');
  next.reservation.status = 'cancellation-requested'; next.reservation.version += 1; guarantee.status = 'cancellation-requested'; sync(next);
  return finish(next, command, 'timely-cancellation-requested');
}
export function refundReservationDeposit(state: GuaranteeState, command: Meta & { reference: string }) {
  assert(command.actor.role === 'Finance', 'Only finance can refund reservation deposits.');
  const next = begin(state, command), guarantee = current(next);
  assert(guarantee.status === 'cancellation-requested' && guarantee.refundableAmount > 0, 'A refundable cancellation is required.'); assertCurrent(next);
  assert(command.reference === 'REFUND-RES-204', 'A verified refund reference is required.');
  next.ledger.push({ id: `${command.id}-refund`, kind: 'refund', amount: guarantee.refundableAmount, reference: command.reference, immutable: true });
  guarantee.status = 'refunded'; next.reservation.status = 'refunded'; next.reservation.version += 1; sync(next);
  return finish(next, command, 'reservation-deposit-refunded');
}
export function completeReservationCancellation(state: GuaranteeState, command: Meta) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can complete reservation cancellation.');
  const next = begin(state, command), guarantee = current(next);
  assert(guarantee.status === 'refunded' && next.ledger.some((entry) => entry.kind === 'refund'), 'Completed refund evidence is required.'); assertCurrent(next);
  next.inventory.confirmed -= 1; next.inventory.available += 1; next.inventory.version += 1;
  next.reservation.status = 'cancelled'; next.reservation.version += 1; guarantee.status = 'cancelled'; sync(next);
  return finish(next, command, 'reservation-cancelled-inventory-restored');
}
export class GuaranteeRepository {
  static key = 'staypilot:reservation-guarantees:v1'; private storage: Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage; }
  read() { const raw = this.storage.getItem(GuaranteeRepository.key); return raw ? JSON.parse(raw) as GuaranteeState : structuredClone(initialGuaranteeState); }
  commit(expectedRevision: number, operation: (state: GuaranteeState) => GuaranteeState) { const state = this.read(); assert(state.revision === expectedRevision, 'Another session changed the reservation guarantee. Refresh before retrying.'); const next = operation(state); this.storage.setItem(GuaranteeRepository.key, JSON.stringify(next)); return next; }
}
