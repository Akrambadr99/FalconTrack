export type StayDossierRole = 'Front Desk' | 'Housekeeping' | 'Duty Manager' | 'Finance';

export interface StayDossierState {
  revision: number;
  reservation: { id: string; guest: string; status: 'confirmed' | 'in-house' | 'checkout-pending' | 'checked-out'; version: number; arrival: string; departure: string };
  room: { id: string; status: 'reserved' | 'occupied' | 'dirty' | 'sellable'; version: number; inspectionVersion: number };
  maintenance: { status: 'clear' | 'blocked'; version: number };
  folio: { charges: number; payments: number; depositAuthorized: number; status: 'open' | 'settled'; version: number };
  dossier: {
    id: string; owner: string; status: 'opened' | 'ready' | 'authorized' | 'in-house' | 'checkout-pending' | 'settled' | 'closed';
    reservationVersion: number; roomVersion: number; maintenanceVersion: number; folioVersion: number;
    readinessInspector?: string; authorizationManager?: string;
  } | null;
  events: { id: string; action: string; actor: string; detail: string }[];
}

export const initialStayDossierState: StayDossierState = {
  revision: 0,
  reservation: { id: 'STAY-510', guest: 'Nora Hale', status: 'confirmed', version: 5, arrival: '2026-09-13', departure: '2026-09-15' },
  room: { id: 'ROOM-205', status: 'reserved', version: 4, inspectionVersion: 3 },
  maintenance: { status: 'clear', version: 2 },
  folio: { charges: 40_000, payments: 0, depositAuthorized: 0, status: 'open', version: 3 },
  dossier: null,
  events: [],
};

interface Meta { id: string; expectedRevision: number; actor: { id: string; role: StayDossierRole } }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function begin(state: StayDossierState, command: Meta) {
  assert(state.revision === command.expectedRevision, 'Stay dossier changed. Refresh before retrying.');
  assert(!state.events.some((event) => event.id === command.id), 'Command already applied.');
  return structuredClone(state);
}
function finish(state: StayDossierState, command: Meta, action: string, detail: string) {
  state.revision += 1;
  state.events.push({ id: command.id, action, actor: command.actor.id, detail });
  return state;
}
function dossier(state: StayDossierState) { const current = state.dossier; assert(current, 'Stay dossier does not exist.'); return current; }
function assertArrivalVersions(state: StayDossierState) {
  const current = dossier(state);
  assert(current.reservationVersion === state.reservation.version, 'Reservation changed. Rebuild arrival review.');
  assert(current.roomVersion === state.room.version, 'Room state changed. Repeat readiness inspection.');
  assert(current.maintenanceVersion === state.maintenance.version, 'Maintenance state changed. Repeat readiness review.');
}

export function openStayDossier(state: StayDossierState, command: Meta) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can open stay dossiers.');
  const next = begin(state, command);
  assert(next.reservation.status === 'confirmed' && next.room.status === 'reserved', 'Confirmed reservation with reserved room is required.');
  assert(!next.dossier || next.dossier.status === 'closed', 'An active stay dossier exists.');
  next.dossier = {
    id: command.id + '-stay', owner: command.actor.id, status: 'opened',
    reservationVersion: next.reservation.version, roomVersion: next.room.version,
    maintenanceVersion: next.maintenance.version, folioVersion: next.folio.version,
  };
  return finish(next, command, 'stay-dossier-opened', next.reservation.id);
}

export function verifyRoomReadiness(state: StayDossierState, command: Meta & { evidence: string }) {
  assert(command.actor.role === 'Housekeeping', 'Only housekeeping can verify room readiness.');
  const next = begin(state, command);
  const current = dossier(next);
  assert(current.status === 'opened', 'Opened stay dossier is required.');
  assertArrivalVersions(next);
  assert(next.maintenance.status === 'clear', 'Room has an active maintenance block.');
  assert(command.evidence.trim().length >= 20, 'Readiness evidence must contain at least 20 characters.');
  next.room.inspectionVersion += 1;
  next.room.version += 1;
  current.roomVersion = next.room.version;
  current.readinessInspector = command.actor.id;
  current.status = 'ready';
  return finish(next, command, 'room-readiness-verified', next.room.id);
}

export function authorizeArrivalDeposit(state: StayDossierState, command: Meta & { amount: number }) {
  assert(command.actor.role === 'Duty Manager', 'Only duty managers can authorize arrival deposits.');
  const next = begin(state, command);
  const current = dossier(next);
  assert(current.status === 'ready', 'Verified room readiness is required.');
  assertArrivalVersions(next);
  assert(command.actor.id !== current.readinessInspector, 'Deposit authorization must be independent from room inspection.');
  assert(Number.isInteger(command.amount) && command.amount >= next.folio.charges / 2, 'Deposit must cover at least half of current charges.');
  next.folio.depositAuthorized = command.amount;
  next.folio.version += 1;
  current.folioVersion = next.folio.version;
  current.authorizationManager = command.actor.id;
  current.status = 'authorized';
  return finish(next, command, 'arrival-deposit-authorized', String(command.amount));
}

export function checkInGuest(state: StayDossierState, command: Meta) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can check in guests.');
  const next = begin(state, command);
  const current = dossier(next);
  assert(current.status === 'authorized', 'Authorized arrival dossier is required.');
  assertArrivalVersions(next);
  assert(current.folioVersion === next.folio.version, 'Folio changed after deposit authorization.');
  next.reservation.status = 'in-house'; next.reservation.version += 1;
  next.room.status = 'occupied'; next.room.version += 1;
  current.reservationVersion = next.reservation.version; current.roomVersion = next.room.version;
  current.status = 'in-house';
  return finish(next, command, 'guest-checked-in', next.room.id);
}

export function requestCheckout(state: StayDossierState, command: Meta) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can request checkout.');
  const next = begin(state, command); const current = dossier(next);
  assert(current.status === 'in-house' && next.reservation.status === 'in-house', 'In-house stay is required.');
  next.reservation.status = 'checkout-pending'; next.reservation.version += 1;
  current.reservationVersion = next.reservation.version; current.status = 'checkout-pending';
  return finish(next, command, 'checkout-requested', next.reservation.id);
}

export function settleStayFolio(state: StayDossierState, command: Meta & { payment: number }) {
  assert(command.actor.role === 'Finance', 'Only finance can settle stay folios.');
  const next = begin(state, command); const current = dossier(next);
  assert(current.status === 'checkout-pending', 'Checkout request is required.');
  assert(current.folioVersion === next.folio.version, 'Folio changed before settlement.');
  const balance = next.folio.charges - next.folio.payments;
  assert(command.payment === balance, 'Payment must settle the exact folio balance.');
  next.folio.payments += command.payment; next.folio.status = 'settled'; next.folio.version += 1;
  current.folioVersion = next.folio.version; current.status = 'settled';
  return finish(next, command, 'stay-folio-settled', String(command.payment));
}

export function completeCheckout(state: StayDossierState, command: Meta) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can complete checkout.');
  const next = begin(state, command); const current = dossier(next);
  assert(current.status === 'settled' && next.folio.status === 'settled', 'Settled folio is required.');
  next.reservation.status = 'checked-out'; next.reservation.version += 1;
  next.room.status = 'dirty'; next.room.version += 1;
  current.status = 'closed';
  return finish(next, command, 'guest-checked-out', next.room.id + ' queued for cleaning');
}

export class StayDossierRepository {
  static key = 'staypilot:stay-dossier:v1'; private storage: Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage; }
  read() { const raw = this.storage.getItem(StayDossierRepository.key); return raw ? JSON.parse(raw) as StayDossierState : structuredClone(initialStayDossierState); }
  commit(expectedRevision: number, change: (state: StayDossierState) => StayDossierState) {
    const current = this.read(); assert(current.revision === expectedRevision, 'Another session changed the stay. Refresh before retrying.');
    const next = change(current); this.storage.setItem(StayDossierRepository.key, JSON.stringify(next)); return next;
  }
}
