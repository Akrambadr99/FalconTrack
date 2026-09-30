import { describe, expect, it } from 'vitest';
import { product } from '../product/definition';
import { fresh } from '../workspace/engine';
import { Repository } from '../workspace/repository';
import { AuthoritativeArrivalRepository, authoritativeArrivalSource, arrivalRoomAvailability } from './arrival-source-boundary';
import { BrowserArrivalPersistence, explainArrivalReadiness, initialArrivalPortfolioState } from './arrival-control-domain';

function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { values, storage, arrival: new AuthoritativeArrivalRepository(storage), workspace: new Repository(product, storage) };
}

function escalate(repository: AuthoritativeArrivalRepository) {
  const state = repository.read();
  return repository.dispatch({ id: 'escalate-5812', expectedRevision: state.revision, expectedWorkspaceRevision: state.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' });
}

describe('authoritative arrival source boundary', () => {
  it('resolves one seeded reservation to its own stay, room and pre-arrival folio', () => {
    const { arrival, workspace } = setup();
    const source = authoritativeArrivalSource(workspace.read());
    expect(source).toMatchObject({ reservationId: 'RES-5812', stayId: 'stay-5812', folioId: 'folio-5812', reservation: { assignedRoomId: 'ROOM-512' }, folio: { blocker: true } });
    expect(arrival.read().operationalSources.find((item) => item.reservationId === 'RES-5812')).toEqual(source);
  });

  it('persists replacement, independent evidence and release with the same authoritative workspace write', () => {
    const { arrival, workspace, values } = setup();
    escalate(arrival);
    expect(workspace.read().entities.find((item) => item.id === 'stay-5812')?.fields['room']).toBe('ROOM-824');
    const kinds = ['reservation-check', 'folio-clearance', 'room-inspection', 'occupancy-check', 'manager-review'] as const;
    for (const kind of kinds) {
      const current = arrival.read();
      const role = kind === 'room-inspection' ? 'Housekeeping Coordinator' : kind === 'manager-review' ? 'Duty Manager' : 'Front Desk Agent';
      arrival.dispatch({ id: `evidence-${kind}`, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role, reservationId: 'RES-5812', kind, actor: role, evidenceReference: `EV-${kind}`, recordedOn: '2026-10-20T14:30:00Z' });
    }
    const before = arrival.read();
    expect(explainArrivalReadiness(before, 'RES-5812')?.missingEvidence).toEqual([]);
    arrival.dispatch({ id: 'release-5812', expectedRevision: before.revision, expectedWorkspaceRevision: before.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', frontDeskAcknowledgement: 'FD-ACK', housekeepingAcknowledgement: 'HK-ACK', replacementRoom: 'ROOM-824', originalRoomDisposition: 'ROOM-512 transferred to maintenance', folioClearanceReference: 'EV-folio-clearance', occupancyReference: 'OCC-5812', noShowAuditReference: 'NOSHOW-5812', releasedBy: 'Duty manager north', releasedOn: '2026-10-20T14:45:00Z' });
    const saved = workspace.read();
    expect(saved.entities.find((item) => item.id === 'stay-5812')?.status).toBe('checked-in');
    expect(saved.entities.find((item) => item.id === 'ROOM-824')?.status).toBe('occupied');
    expect(saved.entities.find((item) => item.id === 'folio-5812')?.fields).toMatchObject({ arrivalBlocker: 'no', charges: 30000, arrivalClearance: 'EV-folio-clearance' });
    expect(arrival.read().releases[0]?.sourcePins).toMatchObject({ stayId: 'stay-5812', folioId: 'folio-5812', roomId: 'ROOM-824' });
    expect(values.get(workspace.key)).toContain('arrivalControl');
    expect(values.get(BrowserArrivalPersistence.key)).toBeUndefined();
  });

  it('rejects missing rooms and stale workspace revisions without partial writes', () => {
    const { arrival, workspace, values, storage } = setup();
    const current = arrival.read();
    const invalid = { id: 'missing-room', expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Duty Manager' as const, reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-999', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' };
    expect(() => arrival.dispatch(invalid)).toThrow(/missing from authoritative inventory/);
    expect(values.size).toBe(0);
    const changed = workspace.read();
    changed.entities.find((item) => item.id === 'ROOM-824')!.status = 'blocked';
    changed.entities.find((item) => item.id === 'ROOM-824')!.revision += 1;
    changed.revision += 1;
    storage.setItem(workspace.key, JSON.stringify(changed));
    const before = values.get(workspace.key);
    expect(() => arrival.dispatch({ ...invalid, replacementRoom: 'ROOM-824' })).toThrow(/Refresh before continuing/);
    expect(values.get(workspace.key)).toBe(before);
  });

  it('rejects a stale client and lets it retry from the newer authoritative revision', async () => {
    const { arrival, workspace, storage } = setup();
    const other = new AuthoritativeArrivalRepository(storage);
    const stale = arrival.read();
    const fresh = other.read();
    other.dispatch({ id: 'other-client-escalation', expectedRevision: fresh.revision, expectedWorkspaceRevision: fresh.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' });
    const committed = JSON.stringify(workspace.read());
    await expect(arrival.dispatchCoordinated({ id: 'stale-evidence', expectedRevision: stale.revision, expectedWorkspaceRevision: stale.workspaceRevision, role: 'Front Desk Agent', reservationId: 'RES-5812', kind: 'reservation-check', actor: 'Front Desk Agent', evidenceReference: 'EV-STALE', recordedOn: '2026-10-20T14:30:00Z' })).rejects.toThrow(/Refresh before continuing/);
    expect(JSON.stringify(workspace.read())).toBe(committed);
    const refreshed = arrival.read();
    await arrival.dispatchCoordinated({ id: 'fresh-evidence', expectedRevision: refreshed.revision, expectedWorkspaceRevision: refreshed.workspaceRevision, role: 'Front Desk Agent', reservationId: 'RES-5812', kind: 'reservation-check', actor: 'Front Desk Agent', evidenceReference: 'EV-FRESH', recordedOn: '2026-10-20T14:30:00Z' });
    expect(arrival.read().evidence.map((item) => item.id)).toContain('fresh-evidence');
  });

  it('coordinates a room edit before arrival and revalidates the replacement against its new source revision', async () => {
    const { arrival, workspace, values } = setup();
    const stale = arrival.read();
    const room = workspace.read().entities.find((item) => item.id === 'ROOM-824');
    if (!room) throw new Error('Replacement room missing');
    await workspace.commitCoordinated({ id: 'revise-room-rate', expectedRevision: 0, actorId: 'actor-0', type: 'edit', entityId: room.id, title: room.title, input: { ...room.fields, rate: 16000 } }, '2026-10-20T13:55:00Z');
    const before = values.get(workspace.key);
    await expect(arrival.dispatchCoordinated({ id: 'stale-arrival', expectedRevision: stale.revision, expectedWorkspaceRevision: stale.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' })).rejects.toThrow('Refresh before continuing');
    expect(values.get(workspace.key)).toBe(before);
    const refreshed = arrival.read();
    expect(refreshed.operationalSources.find((item) => item.reservationId === 'RES-5812')?.rooms.find((item) => item.id === 'ROOM-824')?.version).toBe(2);
    await arrival.dispatchCoordinated({ id: 'revalidated-arrival', expectedRevision: refreshed.revision, expectedWorkspaceRevision: refreshed.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' });
    expect(workspace.read().entities.find((item) => item.id === 'ROOM-824')?.fields['rate']).toBe(16000);
    expect(arrival.read().interventions).toHaveLength(1);
  });

  it('rejects a stale operations edit after arrival changes the shared workspace and preserves arrival history', async () => {
    const { arrival, workspace, values } = setup();
    const stale = workspace.read();
    const room = stale.entities.find((item) => item.id === 'ROOM-826');
    if (!room) throw new Error('Inventory room missing');
    const refreshedArrival = arrival.read();
    await arrival.dispatchCoordinated({ id: 'arrival-first', expectedRevision: refreshedArrival.revision, expectedWorkspaceRevision: refreshedArrival.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' });
    const before = values.get(workspace.key);
    const edit = { id: 'edit-after-arrival', expectedRevision: stale.revision, actorId: 'actor-0', type: 'edit' as const, entityId: room.id, title: room.title, input: { ...room.fields, rate: 17000 } };
    await expect(workspace.commitCoordinated(edit, '2026-10-20T14:05:00Z')).rejects.toThrow('Refresh and review');
    expect(values.get(workspace.key)).toBe(before);
    const freshWorkspace = workspace.read();
    await workspace.commitCoordinated({ ...edit, expectedRevision: freshWorkspace.revision }, '2026-10-20T14:05:00Z');
    expect(arrival.read().interventions.map((item) => item.id)).toContain('arrival-first');
    expect(workspace.read().entities.find((item) => item.id === 'ROOM-826')?.fields['rate']).toBe(17000);
  });

  it('detects a workspace revision changing during arrival computation before any stale write', () => {
    const { values, storage, workspace } = setup();
    const arrival = new AuthoritativeArrivalRepository(storage);
    const current = arrival.read();
    let reads = 0;
    const racing = {
      getItem: (key: string) => {
        if (key === workspace.key && ++reads === 2) {
          const changed = workspace.read();
          changed.revision += 1;
          values.set(key, JSON.stringify(changed));
        }
        return storage.getItem(key);
      },
      setItem: storage.setItem,
    };
    const client = new AuthoritativeArrivalRepository(racing);
    expect(() => client.dispatch({ id: 'racing-escalation', expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' })).toThrow(/before arrival was saved/);
    expect(workspace.read().entities.find((item) => item.id === 'stay-5812')?.fields['room']).toBe('ROOM-512');
    expect((workspace.read() as { arrivalControl?: unknown }).arrivalControl).toBeUndefined();
  });

  it('invalidates only evidence dependent on a changed authoritative folio revision', () => {
    const { arrival, workspace, storage } = setup();
    escalate(arrival);
    for (const kind of ['reservation-check', 'folio-clearance'] as const) {
      const current = arrival.read();
      arrival.dispatch({ id: `evidence-${kind}`, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Front Desk Agent', reservationId: 'RES-5812', kind, actor: 'Front Desk Agent', evidenceReference: `EV-${kind}`, recordedOn: '2026-10-20T14:30:00Z' });
    }
    const changed = workspace.read();
    const folio = changed.entities.find((item) => item.id === 'folio-5812')!;
    folio.fields['arrivalBlocker'] = 'yes';
    folio.revision += 1;
    changed.revision += 1;
    storage.setItem(workspace.key, JSON.stringify(changed));
    const readiness = explainArrivalReadiness(arrival.read(), 'RES-5812');
    expect(readiness?.evidence.map((item) => item.kind)).toEqual(['reservation-check']);
    expect(readiness?.missingEvidence).toContain('folio-clearance');
    expect(readiness?.financial.blocker).toBe(true);
  });

  it('migrates an older saved workspace without guessing identities and retains arrival history', () => {
    const { arrival, workspace, storage } = setup();
    const older = fresh(product);
    older.entities = older.entities.filter((item) => !['guest-5812', 'ROOM-512', 'ROOM-824', 'ROOM-826', 'stay-5812', 'folio-5812'].includes(item.id));
    storage.setItem(workspace.key, JSON.stringify(older));
    const legacy = structuredClone(initialArrivalPortfolioState);
    legacy.arrivals.find((item) => item.reservationId === 'RES-5812')!.frontDeskOwner = 'Previous arrival lead';
    storage.setItem(BrowserArrivalPersistence.key, JSON.stringify(legacy));
    expect(arrival.read().arrivals.find((item) => item.reservationId === 'RES-5812')?.frontDeskOwner).toBe('Previous arrival lead');
    escalate(arrival);
    expect(workspace.read().entities.find((item) => item.id === 'stay-5812')?.fields['reservationId']).toBe('RES-5812');
    expect(arrival.read().arrivals.find((item) => item.reservationId === 'RES-5812')?.frontDeskOwner).toBe('Arrival lead');
  });

  it('keeps incompatible legacy intervention history visible but blocks unproven source writes', () => {
    const { arrival, workspace, storage, values } = setup();
    const legacy = structuredClone(initialArrivalPortfolioState);
    legacy.interventions.push({ id: 'old-handoff', reservationId: 'RES-5812', guestName: 'Nora Hassan', previousFrontDeskOwner: 'Front desk west', previousHousekeepingOwner: 'Housekeeping dispatch', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', manager: 'Duty manager north', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', reason: 'Guest arrival had room and folio blockers.', status: 'manager-escalated', immutable: true });
    storage.setItem(BrowserArrivalPersistence.key, JSON.stringify(legacy));
    expect(arrival.read().unresolvedSource).toMatch(/manager must reconcile/);
    const before = values.get(workspace.key);
    expect(() => escalate(arrival)).toThrow(/manager must reconcile/);
    expect(values.get(workspace.key)).toBe(before);
  });
});

describe('arrival inventory obligations', () => {
  it('blocks a physically ready room with scheduled maintenance and recovers through its authoritative release', () => {
    const { arrival, workspace, values } = setup();
    workspace.commit({ id: 'maintenance-824', expectedRevision: 0, actorId: 'actor-0', type: 'create', kind: 'block', title: 'Room 824 safety works', input: { room: 'ROOM-824', start: '2026-10-20', end: '2026-10-21', reason: 'Replace the corridor safety valve' } }, '2026-10-19T10:00:00Z');
    expect(workspace.read().entities.find((item) => item.id === 'ROOM-824')?.status).toBe('ready');
    expect(arrivalRoomAvailability(workspace.read(), 'ROOM-824')).toEqual(['Maintenance maintenance-824 remains scheduled during this stay: Replace the corridor safety valve.']);
    const before = values.get(workspace.key);
    expect(() => escalate(arrival)).toThrow('outstanding operational obligations');
    expect(values.get(workspace.key)).toBe(before);
    expect(arrival.read().interventions).toEqual([]);
    workspace.commit({ id: 'maintenance-released', expectedRevision: workspace.read().revision, actorId: 'actor-0', type: 'operate', entityId: 'maintenance-824', operation: 'release', input: {} }, '2026-10-20T13:00:00Z');
    escalate(arrival);
    expect(arrival.read().interventions).toHaveLength(1);
    expect(workspace.read().entities.find((item) => item.id === 'maintenance-824')?.status).toBe('released');
  });
  it('uses half-open stay boundaries and ignores cancelled reservations and released blocks', () => {
    const { workspace } = setup();
    workspace.commit({ id: 'adjacent-stay', expectedRevision: 0, actorId: 'actor-0', type: 'create', kind: 'stay', title: 'Guest before Nora', input: { room: 'ROOM-824', arrival: '2026-10-18', departure: '2026-10-20', guest: 'Elias Ahmed' } }, '2026-10-18T10:00:00Z');
    expect(arrivalRoomAvailability(workspace.read(), 'ROOM-824')).toEqual([]);
    workspace.commit({ id: 'overlapping-stay', expectedRevision: workspace.read().revision, actorId: 'actor-0', type: 'create', kind: 'stay', title: 'Another arriving guest', input: { room: 'ROOM-824', arrival: '2026-10-20', departure: '2026-10-23', guest: 'Salma Ali' } }, '2026-10-19T10:00:00Z');
    expect(arrivalRoomAvailability(workspace.read(), 'ROOM-824')).toEqual(['Reservation overlapping-stay overlaps 2026-10-20 to 2026-10-23.']);
    workspace.commit({ id: 'cancel-other', expectedRevision: workspace.read().revision, actorId: 'actor-0', type: 'operate', entityId: 'overlapping-stay', operation: 'cancel', input: {} }, '2026-10-19T11:00:00Z');
    expect(arrivalRoomAvailability(workspace.read(), 'ROOM-824')).toEqual([]);
  });
  it('does not mistake a ready physical status for completion of open housekeeping', () => {
    const { workspace, storage, arrival, values } = setup();
    const snapshot = workspace.read();
    snapshot.entities.push({ id: 'unfinished-824', kind: 'task', title: 'Post-maintenance room cleaning', status: 'queued', revision: 1, fields: { room: 'ROOM-824', stay: 'stay-1', assignee: 'Rooms recovery team' } });
    snapshot.revision += 1;
    storage.setItem(workspace.key, JSON.stringify(snapshot));
    const before = values.get(workspace.key);
    expect(arrival.read().operationalSources.find((item) => item.reservationId === 'RES-5812')?.rooms.find((item) => item.id === 'ROOM-824')).toMatchObject({ status: 'ready', occupied: false, availabilityBlockers: ['Housekeeping unfinished-824 remains queued; inspection is required.'] });
    expect(() => escalate(arrival)).toThrow('Housekeeping unfinished-824');
    expect(values.get(workspace.key)).toBe(before);
  });
});
it('blocks a late housekeeping obligation after evidence preparation and releases only after inspection and reverification', () => {
  const { arrival, workspace, storage, values } = setup();
  escalate(arrival);
  for (const kind of ['reservation-check', 'folio-clearance', 'room-inspection', 'occupancy-check', 'manager-review'] as const) {
    const current = arrival.read();
    const role = kind === 'room-inspection' ? 'Housekeeping Coordinator' : kind === 'manager-review' ? 'Duty Manager' : 'Front Desk Agent';
    arrival.dispatch({ id: `prepared-${kind}`, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role, reservationId: 'RES-5812', kind, actor: role, evidenceReference: `EV-${kind}`, recordedOn: '2026-10-20T14:30:00Z' });
  }
  const changed = workspace.read();
  changed.entities.push({ id: 'late-housekeeping', kind: 'task', title: 'Maintenance dust removal', status: 'queued', revision: 1, fields: { room: 'ROOM-824', stay: 'stay-1', assignee: 'Rooms recovery team' } });
  changed.revision += 1;
  storage.setItem(workspace.key, JSON.stringify(changed));
  const before = values.get(workspace.key);
  const history = structuredClone(arrival.read().evidence);
  const release = () => { const current = arrival.read(); return arrival.dispatch({ id: 'release-after-housekeeping', expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', frontDeskAcknowledgement: 'FD-ACK', housekeepingAcknowledgement: 'HK-ACK', replacementRoom: 'ROOM-824', originalRoomDisposition: 'ROOM-512 transferred to maintenance', folioClearanceReference: 'EV-folio-clearance', occupancyReference: 'OCC-5812', noShowAuditReference: 'NOSHOW-5812', releasedBy: 'Duty manager north', releasedOn: '2026-10-20T14:45:00Z' }); };
  expect(explainArrivalReadiness(arrival.read(), 'RES-5812')?.room).toMatchObject({ ready: false, blockers: ['Housekeeping late-housekeeping remains queued; inspection is required.'] });
  expect(() => release()).toThrow('Housekeeping late-housekeeping');
  expect(values.get(workspace.key)).toBe(before);
  expect(arrival.read().evidence).toEqual(history);
  const cleaning = workspace.read();
  cleaning.entities.find((item) => item.id === 'ROOM-824')!.status = 'dirty';
  cleaning.entities.find((item) => item.id === 'ROOM-824')!.revision += 1;
  cleaning.revision += 1;
  storage.setItem(workspace.key, JSON.stringify(cleaning));
  for (const operation of ['clean', 'inspect']) workspace.commit({ id: `late-${operation}`, expectedRevision: workspace.read().revision, actorId: 'actor-2', type: 'operate', entityId: 'late-housekeeping', operation, input: {} }, '2026-10-20T14:35:00Z');
  expect(arrivalRoomAvailability(workspace.read(), 'ROOM-824')).toEqual([]);
  expect(() => release()).toThrow('Independent arrival evidence is missing');
  for (const kind of ['room-inspection', 'occupancy-check', 'manager-review'] as const) {
    const current = arrival.read();
    const role = kind === 'room-inspection' ? 'Housekeeping Coordinator' : kind === 'manager-review' ? 'Duty Manager' : 'Front Desk Agent';
    arrival.dispatch({ id: `reverified-${kind}`, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role, reservationId: 'RES-5812', kind, actor: role, evidenceReference: `RECHECK-${kind}`, recordedOn: '2026-10-20T14:40:00Z' });
  }
  release();
  expect(workspace.read().entities.find((item) => item.id === 'stay-5812')?.status).toBe('checked-in');
  expect(arrival.read().evidence.slice(0, history.length)).toEqual(history);
  expect(workspace.read().entities.find((item) => item.id === 'late-housekeeping')?.status).toBe('inspected');
});

const registration = { id: 'register-Maya', expectedRevision: 0, expectedWorkspaceRevision: 0, role: 'Duty Manager', reservationId: 'RES-5824', roomId: 'ROOM-826', departure: '2026-10-22', registeredBy: 'Duty manager north', registeredOn: '2026-10-20T14:00:00Z' };
it('registers a real pending arrival explicitly and executes its independent authoritative check-in', async () => {
  const { arrival, workspace } = setup();
  let current = await arrival.registerCoordinated(registration);
  expect(authoritativeArrivalSource(workspace.read(), 'RES-5824')).toMatchObject({ stayId: 'RES-5824:stay', folioId: 'RES-5824:folio', reservation: { assignedRoomId: 'ROOM-826' } });
  expect(workspace.read().entities.find((item) => item.id === 'RES-5824:stay')?.fields).toMatchObject({ guestId: 'RES-5824:guest', guest: 'Maya Singh', departure: '2026-10-22' });
  current = arrival.dispatch({ id: 'prepare-Maya', expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5824', arrivalPreparation: true, manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-826', folioAction: 'Verify the registered pre-arrival folio', reason: 'Prepare an explicit arrival with independent room and financial checks.', asOf: '2026-10-20T14:00:00Z' });
  expect(current.interventions[0]).toMatchObject({ reservationId: 'RES-5824', status: 'manager-prepared' });
  for (const kind of ['reservation-check', 'folio-clearance', 'room-inspection', 'occupancy-check', 'manager-review'] as const) {
    const role = kind === 'room-inspection' ? 'Housekeeping Coordinator' : kind === 'manager-review' ? 'Duty Manager' : 'Front Desk Agent';
    current = arrival.dispatch({ id: `Maya-${kind}`, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role, reservationId: 'RES-5824', kind, actor: role, evidenceReference: `MAYA-${kind}`, recordedOn: '2026-10-20T14:30:00Z' });
  }
  arrival.dispatch({ id: 'release-Maya', expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5824', frontDeskAcknowledgement: 'FD-MAYA', housekeepingAcknowledgement: 'HK-MAYA', replacementRoom: 'ROOM-826', originalRoomDisposition: 'Registered original room retained', folioClearanceReference: 'MAYA-folio-clearance', occupancyReference: 'MAYA-OCC', noShowAuditReference: 'MAYA-NOSHOW', releasedBy: 'Duty manager north', releasedOn: '2026-10-20T14:45:00Z' });
  const releasedWorkspace = workspace.read();
  const replayed = arrival.dispatch({ id: 'release-Maya', expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5824', frontDeskAcknowledgement: 'FD-MAYA', housekeepingAcknowledgement: 'HK-MAYA', replacementRoom: 'ROOM-826', originalRoomDisposition: 'Registered original room retained', folioClearanceReference: 'MAYA-folio-clearance', occupancyReference: 'MAYA-OCC', noShowAuditReference: 'MAYA-NOSHOW', releasedBy: 'Duty manager north', releasedOn: '2026-10-20T14:45:00Z' });
  expect(replayed.releases).toHaveLength(1);
  expect(workspace.read()).toEqual(releasedWorkspace);
  expect(() => arrival.dispatch({ id: 'release-Maya', expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5824', frontDeskAcknowledgement: 'FD-MAYA', housekeepingAcknowledgement: 'HK-MAYA', replacementRoom: 'ROOM-826', originalRoomDisposition: 'Registered original room retained', folioClearanceReference: 'ALTERED', occupancyReference: 'MAYA-OCC', noShowAuditReference: 'MAYA-NOSHOW', releasedBy: 'Duty manager north', releasedOn: '2026-10-20T14:45:00Z' })).toThrow('different intent');
  expect(workspace.read().entities.find((item) => item.id === 'RES-5824:stay')?.status).toBe('checked-in');
  expect(workspace.read().entities.find((item) => item.id === 'RES-5824:folio')?.fields['charges']).toBe(30000);
  expect(workspace.read().entities.find((item) => item.id === 'stay-5812')?.status).toBe('reserved');
  expect(workspace.read().entities.find((item) => item.id === 'folio-5812')?.fields['arrivalBlocker']).toBe('yes');
  expect(arrival.read().releases[0]?.sourcePins).toMatchObject({ stayId: 'RES-5824:stay', folioId: 'RES-5824:folio', roomId: 'ROOM-826' });
});
it('rejects missing rooms, invalid dates, ownership, stale registration and duplicate identity without partial records', async () => {
  const { arrival, workspace, values } = setup();
  for (const change of [{ roomId: 'MISSING' }, { departure: '2026-02-31' }, { departure: '2026-10-20' }, { role: 'Front Desk Agent' }, { expectedWorkspaceRevision: 1 }, { reservationId: 'RES-UNKNOWN' }]) {
    await expect(arrival.registerCoordinated({ ...registration, ...change })).rejects.toThrow();
    expect(values.size).toBe(0);
  }
  const registered = await arrival.registerCoordinated(registration);
  const before = values.get(workspace.key);
  await expect(arrival.registerCoordinated({ ...registration, id: 'duplicate', expectedRevision: registered.revision, expectedWorkspaceRevision: registered.workspaceRevision })).rejects.toThrow('already registered');
  expect(values.get(workspace.key)).toBe(before);
});
it('rejects overlapping calendar inventory and leaves legacy arrivals unlinked until explicitly registered', async () => {
  const { arrival, workspace, storage, values } = setup();
  expect(arrival.read().operationalSources.find((item) => item.reservationId === 'RES-5824')?.stayId).toBeUndefined();
  const existing = workspace.read();
  existing.entities.push({ id: 'calendar-conflict', kind: 'stay', title: 'Different actual booking', status: 'reserved', revision: 1, fields: { guest: 'Another guest', room: 'ROOM-826', arrival: '2026-10-20', departure: '2026-10-21' } });
  existing.revision += 1; storage.setItem(workspace.key, JSON.stringify(existing));
  const before = values.get(workspace.key);
  await expect(arrival.registerCoordinated({ ...registration, expectedWorkspaceRevision: existing.revision })).rejects.toThrow('outstanding room');
  expect(values.get(workspace.key)).toBe(before);
  expect(workspace.read().entities.some((item) => item.id === 'RES-5824:stay')).toBe(false);
});
it('rejects direct check-in bypass and missing authoritative folio after explicit registration', async () => {
  const { arrival, workspace, storage } = setup();
  await arrival.registerCoordinated(registration);
  const current = workspace.read();
  expect(() => workspace.commit({ id: 'bypass', expectedRevision: current.revision, actorId: 'actor-0', type: 'operate', entityId: 'RES-5824:stay', operation: 'checkin', input: {} }, '2026-10-20T14:30:00Z')).toThrow('governed recovered-arrival');
  current.entities = current.entities.filter((item) => item.id !== 'RES-5824:folio');
  storage.setItem(workspace.key, JSON.stringify(current));
  expect(() => arrival.read()).toThrow('exactly one authoritative folio');
});

const dateAmendment = { id: 'extend-5812', role: 'Duty Manager', reservationId: 'RES-5812', arrival: '2026-10-20', departure: '2026-10-23', reason: 'Guest requested one additional room night before independent arrival release.', evidenceReference: 'GUEST-EXTENSION-5812', amendedBy: 'Duty manager north', amendedOn: '2026-10-20T14:40:00Z' };
function verifyTeams(repository: AuthoritativeArrivalRepository, prefix: string) {
  for (const kind of ['reservation-check', 'folio-clearance', 'room-inspection', 'occupancy-check', 'manager-review'] as const) {
    const current = repository.read();
    const role = kind === 'room-inspection' ? 'Housekeeping Coordinator' : kind === 'manager-review' ? 'Duty Manager' : 'Front Desk Agent';
    repository.dispatch({ id: prefix + kind, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role, reservationId: 'RES-5812', kind, actor: role, evidenceReference: prefix + kind, recordedOn: '2026-10-20T14:30:00Z' });
  }
}
it('amends owning stay dates atomically and invalidates only date-dependent arrival evidence', async () => {
  const { arrival, workspace } = setup(); escalate(arrival); verifyTeams(arrival, 'original-');
  const before = arrival.read(), sourceBefore = workspace.read();
  const amended = await arrival.amendDatesCoordinated({ ...dateAmendment, expectedRevision: before.revision, expectedWorkspaceRevision: before.workspaceRevision });
  const owning = workspace.read();
  expect(owning.entities.find((item) => item.id === 'stay-5812')?.fields['departure']).toBe('2026-10-23');
  expect(owning.entities.find((item) => item.id === 'folio-5812')).toEqual(sourceBefore.entities.find((item) => item.id === 'folio-5812'));
  expect(owning.entities.find((item) => item.id === 'ROOM-824')).toEqual(sourceBefore.entities.find((item) => item.id === 'ROOM-824'));
  expect(amended.evidence).toEqual(before.evidence);
  expect(amended.invalidations.map((item) => item.kind)).toEqual(['reservation-check', 'occupancy-check', 'manager-review']);
  expect(explainArrivalReadiness(amended, 'RES-5812')?.missingEvidence).toEqual(['reservation-check', 'occupancy-check', 'manager-review']);
  expect(amended.dateAmendments[0]).toMatchObject({ sourceStayRevision: sourceBefore.entities.find((item) => item.id === 'stay-5812')?.revision, previousDeparture: '2026-10-22', departure: '2026-10-23', immutable: true });
  expect(arrivalRoomAvailability(owning, 'ROOM-824')).toEqual([]);
  expect(owning.entities.find((item) => item.id === 'stay-1')).toEqual(sourceBefore.entities.find((item) => item.id === 'stay-1'));
  for (const kind of ['reservation-check', 'occupancy-check', 'manager-review'] as const) {
    const current = arrival.read(); arrival.dispatch({ id: 'renewed-' + kind, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: kind === 'manager-review' ? 'Duty Manager' : 'Front Desk Agent', reservationId: 'RES-5812', kind, actor: 'Independent team', evidenceReference: 'renewed-' + kind, recordedOn: '2026-10-20T14:42:00Z' });
  }
  const ready = arrival.read();
  arrival.dispatch({ id: 'amended-release', expectedRevision: ready.revision, expectedWorkspaceRevision: ready.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', frontDeskAcknowledgement: 'original-reservation-check', housekeepingAcknowledgement: 'original-room-inspection', replacementRoom: 'ROOM-824', originalRoomDisposition: 'ROOM-512 remains blocked', folioClearanceReference: 'original-folio-clearance', occupancyReference: 'renewed-occupancy-check', noShowAuditReference: 'NOSHOW-5812', releasedBy: 'Duty manager north', releasedOn: '2026-10-20T14:45:00Z' });
  expect(workspace.read().entities.find((item) => item.id === 'folio-5812')?.fields['charges']).toBe(45000);
  await expect(arrival.amendDatesCoordinated({ ...dateAmendment, id: 'too-late', expectedRevision: arrival.read().revision, expectedWorkspaceRevision: arrival.read().workspaceRevision })).rejects.toThrow('unreleased');
});
it('rejects a new date overlap without partially writing reservation history or financial records', async () => {
  const { arrival, workspace, storage, values } = setup(); escalate(arrival);
  const saved = workspace.read(); saved.entities.push({ id: 'other-reservation', kind: 'stay', title: 'Different guest', status: 'reserved', revision: 1, fields: { room: 'ROOM-824', guest: 'Different guest', arrival: '2026-10-22', departure: '2026-10-24' } }); saved.revision += 1; storage.setItem(workspace.key, JSON.stringify(saved));
  const current = arrival.read(), before = values.get(workspace.key);
  await expect(arrival.amendDatesCoordinated({ ...dateAmendment, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision })).rejects.toThrow('other-reservation overlaps');
  expect(values.get(workspace.key)).toBe(before); expect(arrival.read().dateAmendments).toEqual([]);
});
it('guards date amendments against stale revisions invalid dates and incorrect authority', async () => {
  const { arrival, workspace, values } = setup(); escalate(arrival); const current = arrival.read(), before = values.get(workspace.key);
  const command = { ...dateAmendment, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision };
  await expect(arrival.amendDatesCoordinated({ ...command, role: 'Front Desk Agent' })).rejects.toThrow('duty manager');
  await expect(arrival.amendDatesCoordinated({ ...command, expectedWorkspaceRevision: 0 })).rejects.toThrow('Refresh');
  for (const dates of [{ arrival: '2026-10-19' }, { departure: '2026-02-30' }, { departure: '2026-10-20' }]) await expect(arrival.amendDatesCoordinated({ ...command, ...dates })).rejects.toThrow('valid stay dates');
  for (const amendedOn of ['2026-10-20T14:40:00+01:00', '2026-10-20T13:40:00-01:00']) await expect(arrival.amendDatesCoordinated({ ...command, amendedOn })).rejects.toThrow('valid stay dates');
  expect(values.get(workspace.key)).toBe(before);
});
it('replays only the same date amendment and rejects pre-amendment evidence while retaining legacy state', async () => {
  const { arrival } = setup(); escalate(arrival); const current = arrival.read();
  const command = { ...dateAmendment, expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision };
  const amended = await arrival.amendDatesCoordinated(command);
  expect((await arrival.amendDatesCoordinated(command)).dateAmendments).toEqual(amended.dateAmendments);
  await expect(arrival.amendDatesCoordinated({ ...command, departure: '2026-10-24' })).rejects.toThrow('different change');
  expect(() => arrival.dispatch({ id: 'old-date-evidence', expectedRevision: amended.revision, expectedWorkspaceRevision: amended.workspaceRevision, role: 'Front Desk Agent', reservationId: 'RES-5812', kind: 'reservation-check', actor: 'Front desk', evidenceReference: 'OLD', recordedOn: '2026-10-20T14:30:00Z' })).toThrow('predate');
  const legacy = new BrowserArrivalPersistence({ getItem: () => JSON.stringify({ ...initialArrivalPortfolioState, dateAmendments: undefined }), setItem: () => undefined }).load();
  expect(legacy?.dateAmendments).toEqual([]);
});
