import { expect, it } from 'vitest'
import { product } from '../product/definition'
import { Repository } from '../workspace/repository'
import { parseStayWorkspaceRecovery, StayWorkspaceRecovery } from './workspace-recovery'
import { AuthoritativeArrivalRepository } from './arrival-source-boundary'

function setup() {
  const values = new Map<string, string>()
  let writes = 0
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); writes += 1 } }
  return { recovery: new StayWorkspaceRecovery(storage), workspace: new Repository(product, storage), arrival: new AuthoritativeArrivalRepository(storage), writes: () => writes }
}

it('captures authoritative guest, room, stay, folio and arrival history and restores in one write', async () => {
  const { recovery, workspace, writes } = setup()
  const archive = recovery.capture({ id: 'snapshot-1', actorId: 'actor-0', createdOn: '2026-10-29' })
  expect(archive).toMatchObject({ schemaVersion: 1, sourceRevision: 0, sources: { guestId: 'guest-5812', stayId: 'stay-5812', folioId: 'folio-5812', assignedRoomId: 'ROOM-512', arrivalRevision: 0 } })
  expect(parseStayWorkspaceRecovery(JSON.stringify(archive))).toEqual(archive)
  expect(recovery.preview(archive, 0).ready).toBe(true)
  const next = await recovery.restoreCoordinated(archive, { expectedRevision: 0, actorId: 'actor-0', restoredOn: '2026-10-29T12:00:00Z' })
  expect(writes()).toBe(1)
  expect(next.audit.at(-1)).toMatchObject({ action: 'workspace-snapshot-restore', entityIds: ['guest-5812', 'stay-5812', 'folio-5812', 'ROOM-512'] })
  expect(workspace.read().revision).toBe(1)
  expect(recovery.preview(archive, 1).ready).toBe(false)
})

it('preserves command receipts and immutable arrival evidence when a same-revision snapshot was edited', async () => {
  const { recovery, workspace, arrival, writes } = setup()
  const comment = { id: 'guest-note', expectedRevision: 0, actorId: 'actor-1', type: 'comment' as const, entityId: 'stay-5812', input: { comment: 'Guest confirmed the arrival time with reception.' } }
  workspace.commit(comment, '2026-10-20T12:00:00Z')
  const current = arrival.read()
  arrival.dispatch({ id: 'arrival-plan', expectedRevision: current.revision, expectedWorkspaceRevision: current.workspaceRevision, role: 'Duty Manager', reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' })
  const archive = recovery.capture({ id: 'protected', actorId: 'actor-0', createdOn: '2026-10-29' })
  const before = workspace.read()
  const count = writes()
  for (const kind of ['audit', 'receipt', 'arrival'] as const) {
    const changed = structuredClone(archive)
    if (kind === 'audit') changed.workspace.audit = changed.workspace.audit.map((event) => ({ ...event, actor: 'Different operator' }))
    if (kind === 'receipt') changed.workspace.receipts = []
    if (kind === 'arrival' && changed.workspace.arrivalControl) changed.workspace.arrivalControl.interventions = []
    await expect(recovery.restoreCoordinated(changed, { expectedRevision: before.revision, actorId: 'actor-0', restoredOn: '2026-10-29T12:00:00Z' })).rejects.toThrow(/Snapshot (changes|omits)/)
    expect(workspace.read()).toEqual(before)
    expect(writes()).toBe(count)
  }
  await recovery.restoreCoordinated(archive, { expectedRevision: before.revision, actorId: 'actor-0', restoredOn: '2026-10-29T12:00:00Z' })
  const restored = workspace.read()
  expect(workspace.commit(comment, '2026-10-29T12:01:00Z')).toEqual(restored)
})

it('rejects future schema, missing room and stale cross-tab restore without partial writes', async () => {
  const { recovery, workspace, writes } = setup()
  const archive = recovery.capture({ id: 'snapshot-1', actorId: 'actor-0', createdOn: '2026-10-29' })
  expect(() => parseStayWorkspaceRecovery(JSON.stringify({ ...archive, schemaVersion: 2 }))).toThrow('Unsupported')
  const broken = structuredClone(archive)
  broken.workspace.entities = broken.workspace.entities.filter((item) => item.id !== 'ROOM-512')
  expect(recovery.preview(broken, 0).ready).toBe(false)
  await expect(recovery.restoreCoordinated(broken, { expectedRevision: 0, actorId: 'actor-0', restoredOn: '2026-10-29T12:00:00Z' })).rejects.toThrow()
  expect(writes()).toBe(0)
  await workspace.commitCoordinated({ id: 'other-tab', expectedRevision: 0, actorId: 'actor-1', type: 'comment', entityId: 'stay-5812', input: { comment: 'Guest confirmed arrival time with front desk.' } }, '2026-10-29T11:00:00Z')
  await expect(recovery.restoreCoordinated(archive, { expectedRevision: 0, actorId: 'actor-0', restoredOn: '2026-10-29T12:00:00Z' })).rejects.toThrow('changed')
  expect(writes()).toBe(1)
  expect(workspace.read().audit.at(-1)?.id).toBe('other-tab')
  await expect(recovery.restoreCoordinated(archive, { expectedRevision: 1, actorId: 'actor-1', restoredOn: '2026-10-29T12:00:00Z' })).rejects.toThrow('duty manager')
})
