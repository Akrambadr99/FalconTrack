import { product } from '../product/definition';
import { coordinateWorkspaceWrite, Repository, type StoragePort } from '../workspace/repository';
import type { Entity, Snapshot } from '../workspace/types';
import { overlaps } from '../workspace/values';
import { validateSnapshot } from '../workspace/validation';
import {
  ArrivalPortfolioRepository,
  BrowserArrivalPersistence,
  initialArrivalPortfolioState,
  prepareArrivalHandoff,
  type ArrivalOperationalSources,
  type ArrivalPortfolioState,
} from './arrival-control-domain';

const reservationId = 'RES-5812';
const stayId = 'stay-5812';
const folioId = 'folio-5812';
const sourceIds = ['guest-5812', 'ROOM-512', 'ROOM-824', 'ROOM-826', stayId, folioId];

type ArrivalWorkspace = Snapshot & { arrivalControl?: ArrivalPortfolioState };
type ArrivalCommand = (Parameters<ArrivalPortfolioRepository['dispatch']>[0] | Parameters<typeof prepareArrivalHandoff>[1]) & { expectedWorkspaceRevision?: number | undefined };

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
export function arrivalRoomAvailability(snapshot: Snapshot, roomId: string, selectedReservationId = reservationId): string[] {
  const stay = snapshot.entities.find((item) => item.kind === 'stay' && item.fields['reservationId'] === selectedReservationId);
  if (!stay) throw new Error('Authoritative reservation stay is missing.');
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
export function authoritativeArrivalSource(snapshot: Snapshot, selectedReservationId = reservationId): ArrivalOperationalSources {
  const stays = snapshot.entities.filter((item) => item.kind === 'stay' && item.fields['reservationId'] === selectedReservationId);
  const stay = stays[0];
  if (stays.length !== 1 || !stay) throw new Error(`${selectedReservationId} must resolve to exactly one authoritative stay.`);
  const guestId = stay.fields['guestId'];
  if (typeof guestId !== 'string') throw new Error(`${selectedReservationId} has an unresolved guest reference.`);
  entity(snapshot, guestId, 'guest');
  const folios = snapshot.entities.filter((item) => item.kind === 'folio' && item.fields['stay'] === stay.id);
  const folio = folios[0];
  if (folios.length !== 1 || !folio) throw new Error(`${selectedReservationId} must resolve to exactly one authoritative folio.`);
  const roomId = stay.fields['room'];
  if (typeof roomId !== 'string') throw new Error(`${selectedReservationId} is missing its assigned room.`);
  entity(snapshot, roomId, 'room');
  return {
    reservationId: selectedReservationId,
    stayId: stay.id,
    folioId: folio.id,
    reservation: { version: stay.revision, assignedRoomId: roomId, arrival: String(stay.fields['arrival']), departure: String(stay.fields['departure']) },
    rooms: snapshot.entities.filter((item) => item.kind === 'room').map((room) => ({
      id: room.id,
      version: room.revision,
      status: room.status === 'ready' || room.status === 'occupied' ? 'ready' as const : 'blocked' as const,
      occupied: room.status === 'occupied',
      availabilityBlockers: arrivalRoomAvailability(snapshot, room.id, selectedReservationId),
    })),
    folio: { version: folio.revision, blocker: folio.fields['arrivalBlocker'] === 'yes', clearanceReference: typeof folio.fields['arrivalClearance'] === 'string' ? folio.fields['arrivalClearance'] : null },
  };
}

function applyArrivalSource(snapshot: Snapshot, before: ArrivalOperationalSources, after: ArrivalOperationalSources, released: boolean): Snapshot {
  const next = structuredClone(snapshot);
  if (!before.stayId || !before.folioId) throw new Error('Explicit authoritative stay and folio references are required.');
  const stay = entity(next, before.stayId, 'stay');
  const folio = entity(next, before.folioId, 'folio');
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
    arrival.dateAmendments = (saved as Partial<ArrivalPortfolioState>).dateAmendments ?? [];
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
    const sharedSources = arrival.arrivals.filter((item) => workspace.entities.some((record) => record.kind === 'stay' && record.fields['reservationId'] === item.reservationId)).map((item) => {
      const shared = authoritativeArrivalSource(workspace, item.reservationId);
      const sharedRoom = shared.rooms.find((room) => room.id === shared.reservation.assignedRoomId);
      item.folioBlocker = shared.folio.blocker;
      item.roomStatus = sharedRoom?.status ?? 'blocked';
      return shared;
    });
    arrival.operationalSources = [...arrival.operationalSources.filter((item) => !sharedSources.some((shared) => shared.reservationId === item.reservationId)), ...sharedSources];
    arrival.workspaceRevision = workspace.revision;
    return { workspace, arrival, source };
  }
  async registerCoordinated(command: { id: string; expectedRevision: number; expectedWorkspaceRevision?: number | undefined; role: string; reservationId: string; roomId: string; departure: string; registeredBy: string; registeredOn: string }): Promise<ArrivalPortfolioState> {
    return coordinateWorkspaceWrite(this.workspace.key, () => {
      const { workspace, arrival } = this.bundle();
      if (command.role !== 'Duty Manager') throw new Error('Only the duty manager can register authoritative arrival records.');
      if (command.expectedRevision !== arrival.revision || command.expectedWorkspaceRevision !== workspace.revision) throw new Error('Arrival or authoritative workspace changed. Refresh before registration.');
      const record = arrival.arrivals.find((item) => item.reservationId === command.reservationId);
      if (!record || !command.id.trim() || !command.registeredBy.trim() || !Number.isFinite(Date.parse(command.registeredOn))) throw new Error('A current pending arrival, registration identity and named actor are required.');
      if (workspace.entities.some((item) => item.kind === 'stay' && item.fields['reservationId'] === record.reservationId) || arrival.interventions.some((item) => item.reservationId === record.reservationId) || arrival.releases.some((item) => item.reservationId === record.reservationId)) throw new Error('This arrival is already registered or has legacy actions requiring explicit source reconciliation.');
      const start = record.expectedAt.slice(0, 10);
      const validDeparture = /^20\d{2}-\d{2}-\d{2}$/.test(command.departure) && Number.isFinite(Date.parse(command.departure)) && new Date(command.departure).toISOString().slice(0, 10) === command.departure;
      const room = entity(workspace, command.roomId, 'room');
      if (!validDeparture || command.departure <= start || room.status === 'occupied') throw new Error('A valid departure after arrival and unoccupied authoritative room are required.');
      const next = structuredClone(workspace);
      const guestId = `${record.reservationId}:guest`, registeredStayId = `${record.reservationId}:stay`, registeredFolioId = `${record.reservationId}:folio`;
      if ([guestId, registeredStayId, registeredFolioId].some((id) => next.entities.some((item) => item.id === id))) throw new Error('Registration identity conflicts with an existing owning record. No link was inferred.');
      next.entities.push({ id: guestId, kind: 'guest', title: record.guestName, status: 'active', revision: 1, fields: { name: record.guestName } }, { id: registeredStayId, kind: 'stay', title: `${record.guestName} · October arrival`, status: 'reserved', revision: 1, fields: { reservationId: record.reservationId, guestId, guest: record.guestName, room: room.id, arrival: start, departure: command.departure } }, { id: registeredFolioId, kind: 'folio', title: `${record.guestName} · pre-arrival folio`, status: 'open', revision: 1, fields: { stay: registeredStayId, charges: 0, payments: 0, arrivalBlocker: record.folioBlocker ? 'yes' : 'no' } });
      const availability = arrivalRoomAvailability(next, room.id, record.reservationId);
      if (availability.length) throw new Error('Arrival registration has outstanding room obligations. ' + availability.join(' '));
      validateSnapshot(next, product);
      next.revision += 1;
      const nextArrival = structuredClone(arrival); nextArrival.revision += 1; nextArrival.workspaceRevision = next.revision;
      const { operationalSources: _sources, ...history } = nextArrival; void _sources;
      (next as ArrivalWorkspace).arrivalControl = { ...history, operationalSources: [] };
      next.audit.push({ id: command.id, at: command.registeredOn, actor: command.registeredBy, action: 'arrival-registration', entityIds: [guestId, registeredStayId, room.id, registeredFolioId], summary: `${record.reservationId} explicitly registered from the pending arrival with entered departure ${command.departure}.` });
      if (this.workspace.read().revision !== workspace.revision) throw new Error('Another client changed the authoritative workspace before registration was saved. Refresh and retry.');
      this.storage.setItem(this.workspace.key, JSON.stringify(next));
      return this.read();
    });
  }
  async amendDatesCoordinated(command: { id: string; expectedRevision: number; expectedWorkspaceRevision?: number | undefined; role: string; reservationId: string; arrival: string; departure: string; reason: string; evidenceReference: string; amendedBy: string; amendedOn: string }): Promise<ArrivalPortfolioState> {
    return coordinateWorkspaceWrite(this.workspace.key, () => {
      const { workspace, arrival } = this.bundle();
      const fingerprint = JSON.stringify(Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'expectedRevision' && key !== 'expectedWorkspaceRevision').sort(([left], [right]) => left.localeCompare(right))));
      const receipt = workspace.receipts.find((item) => item.id === command.id);
      if (receipt) { if (receipt.fingerprint !== fingerprint) throw new Error('Amendment identity already records a different change.'); return arrival; }
      if (command.role !== 'Duty Manager') throw new Error('Only the duty manager can authorize arrival date amendments.');
      if (command.expectedRevision !== arrival.revision || command.expectedWorkspaceRevision !== workspace.revision) throw new Error('Arrival or authoritative workspace changed. Refresh before amending dates.');
      if (arrival.unresolvedSource) throw new Error(arrival.unresolvedSource);
      const source = authoritativeArrivalSource(workspace, command.reservationId);
      const stay = entity(workspace, source.stayId ?? '', 'stay');
      const folio = entity(workspace, source.folioId ?? '', 'folio');
      const record = arrival.arrivals.find((item) => item.reservationId === command.reservationId);
      if (!record || stay.status !== 'reserved' || folio.status !== 'open' || arrival.releases.some((item) => item.reservationId === command.reservationId)) throw new Error('Only an explicitly registered, unreleased reserved stay can amend arrival dates.');
      const validDate = (value: string) => /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
      const validTimestamp = (value: string) => /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value;
      const day = command.amendedOn.slice(0, 10);
      const latest = arrival.dateAmendments.filter((item) => item.reservationId === command.reservationId).at(-1);
      const evidenceDate = arrival.evidence.filter((item) => item.reservationId === command.reservationId).map((item) => item.recordedOn).sort().at(-1);
      if (!command.id.trim() || !command.amendedBy.trim() || !command.evidenceReference.trim() || command.reason.trim().length < 20 || !validTimestamp(command.amendedOn) || !validDate(day) || !validDate(command.arrival) || !validDate(command.departure) || command.arrival < day || command.departure <= command.arrival || (latest && command.amendedOn < latest.amendedOn) || (evidenceDate && command.amendedOn < evidenceDate)) throw new Error('Current or future valid stay dates, actor, amendment evidence and a specific reason are required.');
      const previousArrival = String(stay.fields['arrival']), previousDeparture = String(stay.fields['departure']);
      if (previousArrival === command.arrival && previousDeparture === command.departure) throw new Error('Amendment must change the authoritative stay dates.');
      const next = structuredClone(workspace), target = entity(next, stay.id, 'stay');
      target.fields['arrival'] = command.arrival; target.fields['departure'] = command.departure; target.revision += 1;
      const blockers = arrivalRoomAvailability(next, String(target.fields['room']), command.reservationId);
      if (blockers.length) throw new Error('Amended stay conflicts with authoritative room obligations. ' + blockers.join(' '));
      validateSnapshot(next, product);
      const nextArrival = structuredClone(arrival);
      const changedArrival = nextArrival.arrivals.find((item) => item.reservationId === command.reservationId);
      if (!changedArrival) throw new Error('Arrival disappeared during date amendment.');
      changedArrival.expectedAt = command.arrival + record.expectedAt.slice(10);
      const affected = arrival.evidence.filter((item) => item.reservationId === command.reservationId && ['reservation-check', 'occupancy-check', 'manager-review'].includes(item.kind) && !arrival.invalidations.some((invalidation) => invalidation.evidenceId === item.id));
      nextArrival.dateAmendments.push({ ...command, stayId: stay.id, sourceStayRevision: stay.revision, previousArrival, previousDeparture, reason: command.reason.trim(), evidenceReference: command.evidenceReference.trim(), amendedBy: command.amendedBy.trim(), invalidatedEvidenceIds: affected.map((item) => item.id), immutable: true });
      for (const evidence of affected) nextArrival.invalidations.push({ id: command.id + ':' + evidence.id, reservationId: command.reservationId, evidenceId: evidence.id, kind: evidence.kind, team: evidence.team, actor: evidence.actor, sourceRevision: evidence.sourceRevision, invalidatedByInterventionId: evidence.interventionId, change: 'Stay dates amended: ' + command.reason.trim(), invalidatedOn: command.amendedOn, replacementRequired: true, immutable: true });
      next.revision += 1; nextArrival.revision += 1; nextArrival.workspaceRevision = next.revision;
      const { operationalSources: _sources, ...history } = nextArrival; void _sources;
      (next as ArrivalWorkspace).arrivalControl = { ...history, operationalSources: [] };
      next.audit.push({ id: command.id, at: command.amendedOn, actor: command.amendedBy.trim(), action: 'arrival-date-amendment', entityIds: [stay.id, source.folioId ?? '', String(stay.fields['room'])], summary: command.reservationId + ' dates ' + previousArrival + '/' + previousDeparture + ' → ' + command.arrival + '/' + command.departure + '; ' + command.evidenceReference.trim() });
      next.receipts.push({ id: command.id, fingerprint });
      if (this.workspace.read().revision !== workspace.revision) throw new Error('Another client changed the owning stay before amendment was saved. Refresh and retry.');
      this.storage.setItem(this.workspace.key, JSON.stringify(next));
      return this.read();
    });
  }
  read(): ArrivalPortfolioState { return this.bundle().arrival; }
  async dispatchCoordinated(command: ArrivalCommand): Promise<ArrivalPortfolioState> {
    return coordinateWorkspaceWrite(this.workspace.key, () => this.dispatch(command));
  }
  dispatch(command: ArrivalCommand): ArrivalPortfolioState {
    const { workspace, arrival } = this.bundle();
    const source = authoritativeArrivalSource(workspace, command.reservationId);
    const fingerprint = JSON.stringify(Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'expectedRevision' && key !== 'expectedWorkspaceRevision').sort(([left], [right]) => left.localeCompare(right))));
    const receipt = workspace.receipts.find((item) => item.id === command.id);
    if (receipt) { if (receipt.fingerprint !== fingerprint) throw new Error('Arrival command identity was already used with different intent.'); return arrival; }
    const legacyRelease = arrival.releases.find((item) => item.id === command.id);
    if (legacyRelease && 'occupancyReference' in command) {
      const keys = ['reservationId', 'frontDeskAcknowledgement', 'housekeepingAcknowledgement', 'replacementRoom', 'originalRoomDisposition', 'folioClearanceReference', 'occupancyReference', 'noShowAuditReference', 'releasedBy', 'releasedOn'] as const;
      if (keys.some((key) => legacyRelease[key] !== command[key])) throw new Error('Arrival release identity was already used with different evidence.');
      return arrival;
    }
    const owningStay = entity(workspace, source.stayId ?? '', 'stay');
    if (owningStay.status !== 'reserved') throw new Error('Only an active reserved stay accepts arrival preparation or evidence.');
    if (arrival.unresolvedSource) throw new Error(arrival.unresolvedSource);
    if (command.expectedWorkspaceRevision !== workspace.revision) throw new Error('Authoritative reservation, room or folio changed. Refresh before continuing.');
    const latestDateAmendment = arrival.dateAmendments.filter((item) => item.reservationId === command.reservationId).at(-1);
    const activityOn = 'recordedOn' in command ? command.recordedOn : 'releasedOn' in command ? command.releasedOn : null;
    if (latestDateAmendment && activityOn && (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(activityOn) || !Number.isFinite(Date.parse(activityOn)) || activityOn < latestDateAmendment.amendedOn)) throw new Error('New verification or release cannot predate the active stay date amendment.');
    if ('replacementRoom' in command) {
      const candidate = source.rooms.find((room) => room.id === command.replacementRoom);
      if (!candidate) throw new Error('Replacement room is missing from authoritative inventory.');
      if (candidate.status !== 'ready' || candidate.occupied) throw new Error('Replacement room is not ready and vacant.');
      if (candidate.availabilityBlockers?.length) throw new Error('Replacement room has outstanding operational obligations. ' + candidate.availabilityBlockers.join(' '));
    }
    if ('occupancyReference' in command) {
      const stay = entity(workspace, source.stayId ?? '', 'stay');
      const day = command.releasedOn.slice(0, 10);
      if (day < String(stay.fields['arrival']) || day >= String(stay.fields['departure'])) throw new Error('Operational release must occur within the authoritative stay dates.');
      const required = ['reservation-check', 'folio-clearance', 'room-inspection', 'occupancy-check', 'manager-review'];
      const current = arrival.evidence.filter((item) => item.reservationId === command.reservationId && !arrival.invalidations.some((invalidation) => invalidation.evidenceId === item.id));
      if (required.some((kind) => !current.some((item) => item.kind === kind))) throw new Error('Independent team evidence is required before authoritative check-in.');
    }
    const domain = new ArrivalPortfolioRepository({ load: () => arrival, save: () => undefined });
    const nextArrival = 'arrivalPreparation' in command ? prepareArrivalHandoff(arrival, command) : domain.dispatch(command);
    if (nextArrival === arrival) return arrival;
    const changedSource = nextArrival.operationalSources.find((item) => item.reservationId === command.reservationId);
    if (!changedSource) throw new Error('Authoritative arrival source disappeared.');
    const released = nextArrival.releases.length > arrival.releases.length;
    const nextWorkspace = applyArrivalSource(workspace, source, changedSource, released);
    nextWorkspace.audit.push({ id: command.id, at: 'recordedOn' in command ? command.recordedOn : 'releasedOn' in command ? command.releasedOn : 'revisedOn' in command ? command.revisedOn : 'changedOn' in command ? command.changedOn : 'asOf' in command ? command.asOf : '2026-10-20T14:00:00Z', actor: command.role, action: released ? 'arrival-release' : 'arrival-control', entityIds: [source.stayId ?? "", source.folioId ?? "", String(changedSource.reservation.assignedRoomId)], summary: `${command.reservationId} arrival control revision ${String(nextArrival.revision)}` });
    nextWorkspace.receipts.push({ id: command.id, fingerprint });
    nextArrival.workspaceRevision = nextWorkspace.revision;
    const { operationalSources: _sources, ...history } = nextArrival;
    void _sources;
    (nextWorkspace as ArrivalWorkspace).arrivalControl = { ...history, operationalSources: [] };
    if (this.workspace.read().revision !== workspace.revision) throw new Error('Another client changed the authoritative workspace before arrival was saved. Refresh and retry.');
    this.storage.setItem(this.workspace.key, JSON.stringify(nextWorkspace));
    return this.read();
  }
}
