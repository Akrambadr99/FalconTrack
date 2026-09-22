import { describe, expect, it } from 'vitest';
import { product } from '../product/definition';
import { fresh } from '../workspace/engine';
import { Repository } from '../workspace/repository';
import { AuthoritativeArrivalRepository, authoritativeArrivalSource } from './arrival-source-boundary';
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
