export type ArrivalRole = 'Front Desk' | 'Duty Manager' | 'Housekeeping Coordinator';
export type ArrivalFilter = 'all' | 'due-now' | 'needs-room';
export interface ArrivalReservation {
  id: string;
  version: number;
  guestName: string;
  arrivalDate: string;
  roomType: 'Deluxe King' | 'Twin';
  status: 'expected' | 'checked-in';
  owner: string | null;
  identityStatus: 'pending' | 'verified';
  roomId: string | null;
}
export interface ArrivalRoom {
  id: string;
  version: number;
  roomType: 'Deluxe King' | 'Twin';
  readiness: 'clean' | 'cleaning';
  occupancy: 'available' | 'occupied';
  reservationId: string | null;
}
export interface ArrivalQueueState {
  revision: number;
  queueVersion: number;
  inventoryFeedVersion: number;
  filter: ArrivalFilter;
  selectedIds: string[];
  reservations: ArrivalReservation[];
  rooms: ArrivalRoom[];
  events: { id: string; action: string; actor: string; reservationId?: string; immutable: true }[];
}

export const initialArrivalQueueState: ArrivalQueueState = {
  revision: 0,
  queueVersion: 8,
  inventoryFeedVersion: 4,
  filter: 'all',
  selectedIds: [],
  reservations: [
    { id: 'ARRIVAL-301', version: 3, guestName: 'Nora Ali', arrivalDate: '2026-09-14', roomType: 'Deluxe King', status: 'expected', owner: null, identityStatus: 'pending', roomId: null },
    { id: 'ARRIVAL-302', version: 2, guestName: 'Samir Fawzy', arrivalDate: '2026-09-15', roomType: 'Twin', status: 'expected', owner: null, identityStatus: 'verified', roomId: null },
    { id: 'ARRIVAL-303', version: 7, guestName: 'Maya Nabil', arrivalDate: '2026-09-14', roomType: 'Twin', status: 'checked-in', owner: 'desk-b', identityStatus: 'verified', roomId: 'ROOM-301' },
  ],
  rooms: [
    { id: 'ROOM-301', version: 6, roomType: 'Twin', readiness: 'clean', occupancy: 'occupied', reservationId: 'ARRIVAL-303' },
    { id: 'ROOM-302', version: 4, roomType: 'Deluxe King', readiness: 'cleaning', occupancy: 'available', reservationId: null },
    { id: 'ROOM-303', version: 5, roomType: 'Twin', readiness: 'clean', occupancy: 'available', reservationId: null },
  ],
  events: [],
};

interface Meta { id: string; expectedRevision: number; actor: { id: string; role: ArrivalRole } }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function begin(state: ArrivalQueueState, command: Meta) {
  assert(state.revision === command.expectedRevision, 'Arrival queue changed. Refresh before retrying.');
  assert(!state.events.some((event) => event.id === command.id), 'Arrival queue command already applied.');
  return structuredClone(state);
}
function finish(state: ArrivalQueueState, command: Meta, action: string, reservationId?: string) {
  state.revision += 1;
  state.queueVersion += 1;
  state.events.push({ id: command.id, action, actor: command.actor.id, ...(reservationId ? { reservationId } : {}), immutable: true });
  return state;
}
export function visibleArrivals(state: ArrivalQueueState) {
  if (state.filter === 'due-now') return state.reservations.filter((item) => item.arrivalDate === '2026-09-14' && item.status === 'expected');
  if (state.filter === 'needs-room') return state.reservations.filter((item) => item.status === 'expected' && !item.roomId);
  return state.reservations;
}
function selectedArrival(state: ArrivalQueueState) {
  assert(state.selectedIds.length === 1, 'Select exactly one arrival for this action.');
  const reservation = state.reservations.find((item) => item.id === state.selectedIds[0]);
  assert(reservation, 'The selected arrival no longer exists.');
  return reservation;
}

export function changeArrivalFilter(state: ArrivalQueueState, command: Meta & { filter: ArrivalFilter }) {
  const next = begin(state, command);
  next.filter = command.filter;
  const visibleIds = new Set(visibleArrivals(next).map((item) => item.id));
  next.selectedIds = next.selectedIds.filter((id) => visibleIds.has(id));
  return finish(next, command, 'arrival-filter-changed');
}

export function toggleArrivalSelection(state: ArrivalQueueState, command: Meta & { reservationId: string }) {
  const next = begin(state, command);
  assert(visibleArrivals(next).some((item) => item.id === command.reservationId), 'Only a visible arrival can be selected.');
  next.selectedIds = next.selectedIds.includes(command.reservationId) ? [] : [command.reservationId];
  return finish(next, command, 'arrival-selection-changed', command.reservationId);
}

export function claimSelectedArrival(state: ArrivalQueueState, command: Meta & { expectedReservationVersion: number }) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can claim arrivals.');
  const next = begin(state, command), reservation = selectedArrival(next);
  assert(reservation.version === command.expectedReservationVersion, 'Selected reservation changed before ownership was claimed.');
  assert(reservation.status === 'expected' && !reservation.owner, 'An unowned expected arrival is required.');
  reservation.owner = command.actor.id;
  reservation.version += 1;
  return finish(next, command, 'arrival-ownership-claimed', reservation.id);
}

export function verifySelectedArrivalIdentity(state: ArrivalQueueState, command: Meta & { documentReference: string }) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can verify arrival identity.');
  const next = begin(state, command), reservation = selectedArrival(next);
  assert(reservation.owner === command.actor.id, 'The arrival must be owned by the verifying front desk agent.');
  assert(reservation.identityStatus === 'pending', 'Arrival identity is already verified.');
  assert(command.documentReference === 'PASSPORT-301', 'The identity document does not match the selected guest.');
  reservation.identityStatus = 'verified';
  reservation.version += 1;
  return finish(next, command, 'arrival-identity-verified', reservation.id);
}

export function applyRoomInventoryRefresh(
  state: ArrivalQueueState,
  command: Meta & { responseVersion: number; capturedQueueVersion: number; readyRoomIds: string[] },
) {
  assert(command.actor.role === 'Housekeeping Coordinator', 'Only housekeeping coordinators can refresh room readiness.');
  const next = begin(state, command);
  assert(command.capturedQueueVersion === state.queueVersion, 'Arrival queue changed while room readiness was loading. Retry refresh.');
  assert(command.responseVersion > next.inventoryFeedVersion, 'Stale room inventory response ignored.');
  for (const room of next.rooms) {
    if (command.readyRoomIds.includes(room.id) && room.readiness !== 'clean') {
      room.readiness = 'clean';
      room.version += 1;
    }
  }
  next.inventoryFeedVersion = command.responseVersion;
  const visibleIds = new Set(visibleArrivals(next).map((item) => item.id));
  next.selectedIds = next.selectedIds.filter((id) => visibleIds.has(id));
  return finish(next, command, 'room-inventory-refreshed');
}

export function assignSelectedReadyRoom(state: ArrivalQueueState, command: Meta & { roomId: string; expectedRoomVersion: number }) {
  assert(command.actor.role === 'Duty Manager', 'Only duty managers can assign arrival rooms.');
  const next = begin(state, command), reservation = selectedArrival(next);
  assert(reservation.status === 'expected' && reservation.identityStatus === 'verified' && reservation.owner, 'Owned identity-verified arrival is required.');
  const room = next.rooms.find((item) => item.id === command.roomId);
  assert(room?.version === command.expectedRoomVersion, 'Selected room changed before assignment.');
  assert(room.roomType === reservation.roomType && room.readiness === 'clean' && room.occupancy === 'available' && !room.reservationId, 'A clean available room of the requested type is required.');
  room.reservationId = reservation.id;
  room.version += 1;
  reservation.roomId = room.id;
  reservation.version += 1;
  return finish(next, command, 'arrival-room-assigned', reservation.id);
}

export function checkInSelectedArrival(state: ArrivalQueueState, command: Meta) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can check in arrivals.');
  const next = begin(state, command), reservation = selectedArrival(next);
  assert(reservation.owner === command.actor.id && reservation.identityStatus === 'verified' && reservation.roomId, 'Owned verified arrival with a room is required.');
  const room = next.rooms.find((item) => item.id === reservation.roomId);
  assert(room?.reservationId === reservation.id && room.readiness === 'clean' && room.occupancy === 'available', 'Assigned room is no longer ready for check-in.');
  reservation.status = 'checked-in';
  reservation.version += 1;
  room.occupancy = 'occupied';
  room.version += 1;
  next.selectedIds = [];
  return finish(next, command, 'arrival-checked-in', reservation.id);
}

export class ArrivalQueueRepository {
  static key = 'staypilot:arrival-queue:v1';
  private storage: Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage; }
  read() { const raw = this.storage.getItem(ArrivalQueueRepository.key); return raw ? JSON.parse(raw) as ArrivalQueueState : structuredClone(initialArrivalQueueState); }
  commit(expectedRevision: number, operation: (state: ArrivalQueueState) => ArrivalQueueState) {
    const state = this.read();
    assert(state.revision === expectedRevision, 'Another session changed the arrival queue. Refresh before retrying.');
    const next = operation(state);
    this.storage.setItem(ArrivalQueueRepository.key, JSON.stringify(next));
    return next;
  }
}
