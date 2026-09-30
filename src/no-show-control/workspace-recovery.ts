import { product } from '../product/definition'
import { coordinateWorkspaceWrite, Repository, type StoragePort } from '../workspace/repository'
import type { Snapshot } from '../workspace/types'
import { validateSnapshot } from '../workspace/validation'
import { requireThat } from '../workspace/values'
import { AuthoritativeArrivalRepository, authoritativeArrivalSource } from './arrival-source-boundary'
import type { ArrivalPortfolioState } from './arrival-control-domain'

type ArrivalWorkspace = Snapshot & { arrivalControl?: ArrivalPortfolioState }
export interface StayWorkspaceRecoverySnapshot { schemaVersion: 1; id: string; product: 'StayPilot'; sourceRevision: number; createdOn: string; capturedBy: string; sources: { guestId: 'guest-5812'; stayId: 'stay-5812'; folioId: 'folio-5812'; assignedRoomId: string; roomIds: string[]; arrivalRevision: number }; workspace: ArrivalWorkspace }

function validateRecovery(snapshot: StayWorkspaceRecoverySnapshot) {
  requireThat((snapshot as { schemaVersion: number; product: string }).schemaVersion === 1 && (snapshot as { schemaVersion: number; product: string }).product === 'StayPilot', 'Unsupported StayPilot workspace snapshot schema or product.')
  requireThat(snapshot.id.trim().length > 0 && /^20\d{2}-\d{2}-\d{2}$/.test(snapshot.createdOn), 'Snapshot identity and business date are required.')
  validateSnapshot(snapshot.workspace, product)
  requireThat(snapshot.workspace.revision === snapshot.sourceRevision, 'Snapshot source revision does not match its workspace.')
  const source = authoritativeArrivalSource(snapshot.workspace)
  requireThat((snapshot.sources as { guestId: string }).guestId === 'guest-5812' && snapshot.sources.stayId === source.stayId && snapshot.sources.folioId === source.folioId && snapshot.sources.assignedRoomId === source.reservation.assignedRoomId, 'Snapshot reservation, room or folio source identity is inconsistent.')
  requireThat(snapshot.sources.roomIds.every((id) => source.rooms.some((room) => room.id === id)) && snapshot.sources.arrivalRevision === snapshot.workspace.arrivalControl?.revision, 'Snapshot room or arrival history source is incomplete.')
  const arrival = snapshot.workspace.arrivalControl
  requireThat(!arrival.unresolvedSource, 'Snapshot has unresolved arrival source history.')
  requireThat(arrival.interventions.every((item) => item.reservationId === source.reservationId && source.rooms.some((room) => room.id === item.replacementRoom)) && arrival.releases.every((item) => item.reservationId === source.reservationId && source.rooms.some((room) => room.id === item.replacementRoom)), 'Arrival intervention or release points to a missing authoritative room.')
  requireThat(arrival.evidence.every((item) => item.reservationId === source.reservationId && (item.sourcePins?.stayId === undefined || item.sourcePins.stayId === source.stayId) && (item.sourcePins?.folioId === undefined || item.sourcePins.folioId === source.folioId)), 'Arrival evidence points to a missing stay or folio source.')
}

export function parseStayWorkspaceRecovery(raw: string): StayWorkspaceRecoverySnapshot {
  requireThat(raw.length <= 20_000_000, 'Workspace snapshot is too large.')
  const parsed = JSON.parse(raw) as StayWorkspaceRecoverySnapshot
  validateRecovery(parsed)
  return parsed
}

export class StayWorkspaceRecovery {
  private readonly storage: StoragePort
  private readonly workspace: Repository
  constructor(storage: StoragePort) { this.storage = storage; this.workspace = new Repository(product, storage) }
  capture(command: { id: string; actorId: string; createdOn: string }): StayWorkspaceRecoverySnapshot {
    const actor = product.actors.find((item) => item.id === command.actorId)
    requireThat(actor?.role === 'Duty Manager', 'Only the duty manager can capture a governed workspace snapshot.')
    const workspace = this.workspace.read()
    const arrival = new AuthoritativeArrivalRepository(this.storage).read()
    requireThat(!arrival.unresolvedSource && arrival.workspaceRevision === workspace.revision, 'Arrival source state changed or needs reconciliation before capture.')
    const source = authoritativeArrivalSource(workspace)
    const snapshot: StayWorkspaceRecoverySnapshot = { schemaVersion: 1, id: command.id, product: 'StayPilot', sourceRevision: workspace.revision, createdOn: command.createdOn, capturedBy: actor.id, sources: { guestId: 'guest-5812', stayId: 'stay-5812', folioId: 'folio-5812', assignedRoomId: source.reservation.assignedRoomId ?? '', roomIds: source.rooms.map((room) => room.id), arrivalRevision: arrival.revision }, workspace: { ...structuredClone(workspace), arrivalControl: structuredClone(arrival) } }
    validateRecovery(snapshot)
    return snapshot
  }
  preview(snapshot: StayWorkspaceRecoverySnapshot, expectedRevision: number) {
    const reasons: string[] = []
    try { validateRecovery(snapshot) } catch (error) { reasons.push(error instanceof Error ? error.message : 'Invalid workspace snapshot.') }
    const current = this.workspace.read() as ArrivalWorkspace
    if (current.revision !== expectedRevision) reasons.push('Workspace changed after preview. Refresh before restoring.')
    if (snapshot.sourceRevision !== current.revision) reasons.push('Snapshot is older than the current workspace revision; newer operations cannot be overwritten.')
    if (current.audit.some((event) => !snapshot.workspace.audit.some((saved) => saved.id === event.id))) reasons.push('Snapshot omits current audit history.')
    if (current.audit.some((event) => snapshot.workspace.audit.some((saved) => saved.id === event.id && JSON.stringify(saved) !== JSON.stringify(event)))) reasons.push('Snapshot changes an existing audit event. Original actor, timestamp, and evidence must be preserved.')
    if (current.receipts.some((receipt) => !snapshot.workspace.receipts.some((saved) => saved.id === receipt.id && saved.fingerprint === receipt.fingerprint))) reasons.push('Snapshot omits or changes an applied command receipt. Restore must preserve duplicate-command protection.')
    if (current.arrivalControl) {
      for (const key of ['interventions', 'evidence', 'invalidations', 'sourceRevisions', 'releases'] as const) {
        if (current.arrivalControl[key].some((event) => !snapshot.workspace.arrivalControl?.[key].some((saved) => saved.id === event.id && JSON.stringify(saved) === JSON.stringify(event)))) reasons.push(`Snapshot omits or changes recorded arrival ${key}. Preserve the original arrival evidence before restoring.`)
      }
    }
    if (current.audit.some((event) => event.id === `snapshot-restore:${snapshot.id}`)) reasons.push('Snapshot was already restored.')
    return { ready: reasons.length === 0, reasons, snapshotId: snapshot.id, sourceRevision: snapshot.sourceRevision, currentRevision: current.revision, records: snapshot.workspace.entities.length, arrivalEvents: snapshot.workspace.arrivalControl?.evidence.length ?? 0 }
  }
  async restoreCoordinated(snapshot: StayWorkspaceRecoverySnapshot, command: { expectedRevision: number; actorId: string; restoredOn: string }): Promise<Snapshot> {
    return coordinateWorkspaceWrite(this.workspace.key, () => this.restore(snapshot, command))
  }
  restore(snapshot: StayWorkspaceRecoverySnapshot, command: { expectedRevision: number; actorId: string; restoredOn: string }): Snapshot {
    const actor = product.actors.find((item) => item.id === command.actorId)
    requireThat(actor?.role === 'Duty Manager', 'Only the duty manager can restore a governed workspace snapshot.')
    const preview = this.preview(snapshot, command.expectedRevision)
    requireThat(preview.ready, preview.reasons.join(' '))
    requireThat(Number.isFinite(Date.parse(command.restoredOn)), 'Restoration business timestamp is required.')
    const next: ArrivalWorkspace = structuredClone(snapshot.workspace)
    next.revision = command.expectedRevision + 1
    requireThat(next.arrivalControl, 'Snapshot arrival history disappeared before restore.')
    next.arrivalControl = { ...next.arrivalControl, workspaceRevision: next.revision }
    next.audit.push({ id: `snapshot-restore:${snapshot.id}`, at: command.restoredOn, actor: actor.name, action: 'workspace-snapshot-restore', entityIds: [snapshot.sources.guestId, snapshot.sources.stayId, snapshot.sources.folioId, snapshot.sources.assignedRoomId], summary: `Restored snapshot ${snapshot.id} from workspace revision ${String(snapshot.sourceRevision)}` })
    validateSnapshot(next, product)
    requireThat(this.workspace.read().revision === command.expectedRevision, 'Another tab changed the workspace before restore was saved. Refresh and retry.')
    this.storage.setItem(this.workspace.key, JSON.stringify(next))
    return next
  }
}
