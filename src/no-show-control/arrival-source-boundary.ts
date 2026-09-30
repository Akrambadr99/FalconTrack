import { product } from '../product/definition';
import { coordinateWorkspaceWrite, Repository, type StoragePort } from '../workspace/repository';
import type { Entity, Snapshot } from '../workspace/types';
import { overlaps } from '../workspace/values';
import { validateSnapshot } from '../workspace/validation';
import {
  ArrivalPortfolioRepository,
  BrowserArrivalPersistence,
  initialArrivalPortfolioState,
  type ArrivalOperationalSources,
  type ArrivalPortfolioState,
} from './arrival-control-domain';

const reservationId = 'RES-5812';
const stayId = 'stay-5812';
const folioId = 'folio-5812';
const sourceIds = ['guest-5812', 'ROOM-512', 'ROOM-824', 'ROOM-826', stayId, folioId];

type ArrivalWorkspace = Snapshot & { arrivalControl?: ArrivalPortfolioState };
type ArrivalCommand = Parameters<ArrivalPortfolioRepository['dispatch']>[0] & { expectedWorkspaceRevision?: number | undefined };

function entity(snapshot: Snapshot, id: string, kind: string): Entity {
  const found = snapshot.entities.find((item) => item.id === id && item.kind === kind);
  if (!found) throw new Error(`Authoritative ${kind} ${id} is missing. Resolve the source record before continuing.`);
  return found;
}

function migrateSourceRecords(snapshot: Snapshot): Snapshot {
  const present = sourceIds.filter((id) => snapshot.entities.some((item) => item.id === id));
  if (present.length === sourceIds.length) return snapshot;
  if (present.length > 0) throw new Error('Legacy workspace contains a partial RES-5812 source set. Resolve its identities before migration.');
  const next = structuredClone(snapshot);
  next.entities.push(...structuredClone(product.seed.filter((item) => sourceIds.includes(item.id))));
  validateSnapshot(next, product);
  return next;
}

/** Physical readiness does not release calendar inventory or unfinished team work. */
export function arrivalRoomAvailability(snapshot: Snapshot, roomId: string): string[] {
  const stay = entity(snapshot, stayId, 'stay');
  entity(snapshot, roomId, 'room');
  const start = String(stay.fields['arrival']);
  const end = String(stay.fields['departure']);
  const blockers: string[] = [];
  for (const other of snapshot.entities) {
    if (other.kind === 'stay' && other.id !== stay.id && other.fields['room'] === roomId && ['reserved', 'checked-in'].includes(other.status)) {
      const occupiedSince = typeof other.fields['roomSince'] === 'string' && other.fields['roomSince'] ? other.fields['roomSince'] : String(other.fields['arrival']);
      if (overlaps(start, end, occupiedSince, String(other.fields['departure']))) blockers.push(`Reservation ${other.id} overlaps ${occupiedSince} to ${String(other.fields['departure'])}.`);
    }
    if (other.kind === 'block' && other.fields['room'] === roomId && other.status === 'scheduled' && overlaps(start, end, String(other.fields['start']), String(other.fields['end']))) blockers.push(`Maintenance ${other.id} remains scheduled during this stay: ${String(other.fields['reason'])}.`);
    if (other.kind === 'task' && other.fields['room'] === roomId && other.status !== 'inspected') blockers.push(`Housekeeping ${other.id} remains ${other.status}; inspection is required.`);
  }
  return blockers;
}
export function authoritativeArrivalSource(snapshot: Snapshot): ArrivalOperationalSources {
  const stay = entity(snapshot, stayId, 'stay');
  const folio = entity(snapshot, folioId, 'folio');
  entity(snapshot, 'guest-5812', 'guest');
  if (snapshot.entities.filter((item) => item.kind === 'stay' && item.fields['reservationId'] === reservationId).length !== 1 || snapshot.entities.filter((item) => item.kind === 'folio' && item.fields['stay'] === stayId).length !== 1) {
    throw new Error('RES-5812 must resolve to exactly one authoritative stay and folio.');
  }
  if (stay.fields['reservationId'] !== reservationId || stay.fields['guestId'] !== 'guest-5812' || folio.fields['stay'] !== stay.id) {
    throw new Error('RES-5812 has an unresolved stay or folio reference. No arrival action was saved.');
  }
  const roomId = stay.fields['room'];
  if (typeof roomId !== 'string') throw new Error('RES-5812 is missing its assigned room.');
  entity(snapshot, roomId, 'room');
  return {
    reservationId,
    stayId: stay.id,
    folioId: folio.id,
    reservation: { version: stay.revision, assignedRoomId: roomId },
    rooms: snapshot.entities.filter((item) => item.kind === 'room').map((room) => ({
      id: room.id,
      version: room.revision,
      status: room.status === 'ready' || room.status === 'occupied' ? 'ready' as const : 'blocked' as const,
      occupied: room.status === 'occupied',
      availabilityBlockers: arrivalRoomAvailability(snapshot, room.id),
    })),
    folio: { version: folio.revision, blocker: folio.fields['arrivalBlocker'] === 'yes', clearanceReference: typeof folio.fields['arrivalClearance'] === 'string' ? folio.fields['arrivalClearance'] : null },
  };
}

function applyArrivalSource(snapshot: Snapshot, before: ArrivalOperationalSources, after: ArrivalOperationalSources, released: boolean): Snapshot {
  const next = structuredClone(snapshot);
  const stay = entity(next, stayId, 'stay');
  const folio = entity(next, folioId, 'folio');
  if (after.reservation.assignedRoomId !== before.reservation.assignedRoomId) {
    const selected = after.reservation.assignedRoomId;
    if (!selected) throw new Error('A replacement room must remain assigned.');
    entity(next, selected, 'room');
    stay.fields['room'] = selected;
    stay.revision += 1;
  }
  for (const updated of after.rooms) {
    const prior = before.rooms.find((item) => item.id === updated.id);
    if (!prior) throw new Error(`Room ${updated.id} is not an authoritative inventory record.`);
    if (updated.version === prior.version && updated.status === prior.status && updated.occupied === prior.occupied) continue;
    const room = entity(next, updated.id, 'room');
    if (updated.occupied && room.status !== 'ready') throw new Error('The selected room is no longer ready for occupancy.');
    room.status = updated.occupied ? 'occupied' : updated.status;
    room.revision += 1;
  }
  if (after.folio.version !== before.folio.version || after.folio.blocker !== before.folio.blocker || after.folio.clearanceReference !== before.folio.clearanceReference) {
    folio.fields['arrivalBlocker'] = after.folio.blocker ? 'yes' : 'no';
    if (after.folio.clearanceReference) folio.fields['arrivalClearance'] = after.folio.clearanceReference;
    else delete folio.fields['arrivalClearance'];
    folio.revision += 1;
  }
  if (released) {
    if (stay.status !== 'reserved' || folio.status !== 'open' || after.folio.blocker) throw new Error('Current reservation and folio state do not permit check-in.');
    const room = entity(next, String(stay.fields['room']), 'room');
    if (room.status !== 'occupied') throw new Error('The released room is not occupied.');
    const nights = Math.round((Date.parse(String(stay.fields['departure'])) - Date.parse(String(stay.fields['arrival']))) / 86400000);
    folio.fields['charges'] = nights * Number(room.fields['rate']);
    folio.revision += 1;
    stay.status = 'checked-in';
    stay.revision += 1;
  }
  next.revision += 1;
  validateSnapshot(next, product);
  return next;
}

/** Owns the single workspace write containing both authoritative records and arrival history. */
export class AuthoritativeArrivalRepository {
  private readonly storage: StoragePort;
  private readonly workspace: Repository;
  private readonly legacy: BrowserArrivalPersistence;
  constructor(storage: StoragePort) {
    this.storage = storage;
    this.workspace = new Repository(product, storage);
    this.legacy = new BrowserArrivalPersistence(storage);
  }
  private bundle() {
    const workspace = migrateSourceRecords(this.workspace.read());
    const embedded = (workspace as ArrivalWorkspace).arrivalControl;
    const saved = embedded ?? this.legacy.load() ?? structuredClone(initialArrivalPortfolioState);
    const arrival = structuredClone(saved);
    const source = authoritativeArrivalSource(workspace);
    const seeded = arrival.arrivals.find((item) => item.reservationId === reservationId);
    if (seeded?.guestName !== String(entity(workspace, stayId, 'stay').fields['guest'])) throw new Error('Legacy arrival cannot be linked to the authoritative RES-5812 guest. Its history is preserved for review.');
    const assignedRoom = source.rooms.find((room) => room.id === source.reservation.assignedRoomId);
    seeded.folioBlocker = source.folio.blocker;
    seeded.roomStatus = assignedRoom?.status ?? 'blocked';
    const legacyIntervention = [...arrival.interventions].reverse().find((item) => item.reservationId === reservationId && item.status === 'manager-escalated');
    const legacyRelease = arrival.releases.some((item) => item.reservationId === reservationId);
    if (!embedded && (legacyIntervention && legacyIntervention.replacementRoom !== source.reservation.assignedRoomId || legacyRelease && entity(workspace, stayId, 'stay').status !== 'checked-in')) {
      arrival.unresolvedSource = 'Saved arrival actions predate the authoritative reservation, room and folio records. Their history is preserved, but a manager must reconcile the source links before new actions.';
    }
    arrival.operationalSources = [...arrival.operationalSources.filter((item) => item.reservationId !== reservationId), source];
    arrival.workspaceRevision = workspace.revision;
    return { workspace, arrival, source };
  }
  read(): ArrivalPortfolioState { return this.bundle().arrival; }
  async dispatchCoordinated(command: ArrivalCommand): Promise<ArrivalPortfolioState> {
    return coordinateWorkspaceWrite(this.workspace.key, () => this.dispatch(command));
  }
  dispatch(command: ArrivalCommand): ArrivalPortfolioState {
    const { workspace, arrival, source } = this.bundle();
    if (arrival.unresolvedSource) throw new Error(arrival.unresolvedSource);
    if (command.expectedWorkspaceRevision !== workspace.revision) throw new Error('Authoritative reservation, room or folio changed. Refresh before continuing.');
    if ('replacementRoom' in command) {
      const candidate = source.rooms.find((room) => room.id === command.replacementRoom);
      if (!candidate) throw new Error('Replacement room is missing from authoritative inventory.');
      if (candidate.status !== 'ready' || candidate.occupied) throw new Error('Replacement room is not ready and vacant.');
      if (candidate.availabilityBlockers?.length) throw new Error('Replacement room has outstanding operational obligations. ' + candidate.availabilityBlockers.join(' '));
    }
    if ('occupancyReference' in command) {
      const stay = entity(workspace, stayId, 'stay');
      const day = command.releasedOn.slice(0, 10);
      if (day < String(stay.fields['arrival']) || day >= String(stay.fields['departure'])) throw new Error('Operational release must occur within the authoritative stay dates.');
      const required = ['reservation-check', 'folio-clearance', 'room-inspection', 'occupancy-check', 'manager-review'];
      const current = arrival.evidence.filter((item) => item.reservationId === reservationId && !arrival.invalidations.some((invalidation) => invalidation.evidenceId === item.id));
      if (required.some((kind) => !current.some((item) => item.kind === kind))) throw new Error('Independent team evidence is required before authoritative check-in.');
    }
    const domain = new ArrivalPortfolioRepository({ load: () => arrival, save: () => undefined });
    const nextArrival = domain.dispatch(command);
    if (nextArrival === arrival) return arrival;
    const changedSource = nextArrival.operationalSources.find((item) => item.reservationId === reservationId);
    if (!changedSource) throw new Error('Authoritative arrival source disappeared.');
    const released = nextArrival.releases.length > arrival.releases.length;
    const nextWorkspace = applyArrivalSource(workspace, source, changedSource, released);
    nextWorkspace.audit.push({ id: command.id, at: 'recordedOn' in command ? command.recordedOn : 'releasedOn' in command ? command.releasedOn : 'revisedOn' in command ? command.revisedOn : 'changedOn' in command ? command.changedOn : 'asOf' in command ? command.asOf : '2026-10-20T14:00:00Z', actor: command.role, action: released ? 'arrival-release' : 'arrival-control', entityIds: [stayId, folioId, String(changedSource.reservation.assignedRoomId)], summary: `RES-5812 arrival control revision ${String(nextArrival.revision)}` });
    nextArrival.workspaceRevision = nextWorkspace.revision;
    const { operationalSources: _sources, ...history } = nextArrival;
    void _sources;
    (nextWorkspace as ArrivalWorkspace).arrivalControl = { ...history, operationalSources: [] };
    if (this.workspace.read().revision !== workspace.revision) throw new Error('Another client changed the authoritative workspace before arrival was saved. Refresh and retry.');
    this.storage.setItem(this.workspace.key, JSON.stringify(nextWorkspace));
    return this.read();
  }
}
