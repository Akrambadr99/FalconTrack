import { arrivalUrgencyWorkload, seededUpcomingArrivals, type UpcomingArrivalRecord } from './arrival-urgency'

export type ArrivalControlRole = 'Front Desk Agent' | 'Housekeeping Coordinator' | 'Duty Manager'
export type ArrivalControlErrorCode = 'STALE_REVISION' | 'UNAUTHORIZED' | 'ARRIVAL_INELIGIBLE' | 'EVIDENCE_INCOMPLETE'
export class ArrivalControlError extends Error { readonly code: ArrivalControlErrorCode; readonly reservationId: string; constructor(code: ArrivalControlErrorCode, message: string, reservationId: string) { super(message); this.code = code; this.reservationId = reservationId; this.name = 'ArrivalControlError' } }
export function arrivalCapabilities(role: ArrivalControlRole) {
  return { canApproveReplacement: role === 'Duty Manager', canReleaseArrival: role === 'Duty Manager' } as const
}
export interface CoordinatedArrival extends UpcomingArrivalRecord { frontDeskOwner: string; housekeepingOwner: string }
export interface ArrivalIntervention { id: string; reservationId: string; guestName: string; previousFrontDeskOwner: string; previousHousekeepingOwner: string; frontDeskOwner: string; housekeepingOwner: string; manager: string; replacementRoom: string; folioAction: string; reason: string; status: 'manager-escalated' | 'completed'; immutable: true }
export interface ArrivalReconciliationSnapshot { reservation: { reservationId: string; guestName: string; ready: true }; room: { replacementRoom: string; originalRoomDisposition: string; ready: true }; housekeeping: { acknowledgement: string; ready: true }; folio: { clearanceReference: string; blockerCleared: true }; occupancy: { reference: string; conflictFree: true }; noShow: { auditReference: string; reconciled: true } }
export interface ArrivalSourcePins { reservationVersion: number; roomId: string; roomVersion: number; folioVersion: number; stayId?: string; folioId?: string }
export interface ArrivalOperationalSources { reservationId: string; stayId?: string; folioId?: string; reservation: { version: number; assignedRoomId: string | null }; rooms: { id: string; version: number; status: 'ready' | 'blocked'; occupied: boolean }[]; folio: { version: number; blocker: boolean; clearanceReference: string | null } }
export interface ArrivalRelease { id: string; reservationId: string; interventionId: string; frontDeskAcknowledgement: string; housekeepingAcknowledgement: string; replacementRoom: string; originalRoomDisposition: string; folioClearanceReference: string; occupancyReference: string; noShowAuditReference: string; reconciliation: ArrivalReconciliationSnapshot; sourcePins?: ArrivalSourcePins; releasedBy: string; releasedOn: string; immutable: true }
export type ArrivalEvidenceKind = 'reservation-check' | 'folio-clearance' | 'room-inspection' | 'occupancy-check' | 'manager-review'
export interface ArrivalEvidenceRecord { id: string; reservationId: string; interventionId: string; kind: ArrivalEvidenceKind; team: 'front-desk' | 'housekeeping' | 'duty-management'; actor: string; evidenceReference: string; replacementRoom: string; sourceRevision: number; sourcePins?: ArrivalSourcePins; recordedOn: string; immutable: true }
export interface ArrivalEvidenceInvalidation { id: string; reservationId: string; evidenceId: string; kind: ArrivalEvidenceKind; team: ArrivalEvidenceRecord['team']; actor: string; sourceRevision: number; invalidatedByInterventionId: string; change: string; invalidatedOn: string; replacementRequired: true; immutable: true }
export interface ArrivalSourceRevision { id: string; reservationId: string; interventionId: string; source: 'folio' | 'housekeeping'; sourceReference: string; reason: string; actor: string; revisedOn: string; invalidatedEvidenceIds: string[]; immutable: true }
export interface ArrivalPortfolioState { revision: number; workspaceRevision?: number; unresolvedSource?: string; arrivals: CoordinatedArrival[]; interventions: ArrivalIntervention[]; operationalSources: ArrivalOperationalSources[]; evidence: ArrivalEvidenceRecord[]; invalidations: ArrivalEvidenceInvalidation[]; sourceRevisions: ArrivalSourceRevision[]; releases: ArrivalRelease[] }
function initialSources(arrivals: UpcomingArrivalRecord[], interventions: ArrivalIntervention[] = []): ArrivalOperationalSources[] { return arrivals.map((arrival) => { const roomId = interventions.filter((item) => item.reservationId === arrival.reservationId).at(-1)?.replacementRoom ?? null; return { reservationId: arrival.reservationId, reservation: { version: 0, assignedRoomId: roomId }, rooms: roomId ? [{ id: roomId, version: 0, status: arrival.roomStatus === 'blocked' && !arrival.replacementAvailable ? 'blocked' as const : 'ready' as const, occupied: false }] : [], folio: { version: 0, blocker: arrival.folioBlocker, clearanceReference: null } } }) }
export const initialArrivalPortfolioState: ArrivalPortfolioState = { revision: 0, arrivals: seededUpcomingArrivals.map((item) => ({ ...structuredClone(item), frontDeskOwner: item.operationalOwner === 'Front desk' ? item.operationalOwner : 'Front desk west', housekeepingOwner: 'Housekeeping dispatch' })), interventions: [], operationalSources: initialSources(seededUpcomingArrivals), evidence: [], invalidations: [], sourceRevisions: [], releases: [] }
function sourcePins(source: ArrivalOperationalSources, roomId: string): ArrivalSourcePins { const room = source.rooms.find((item) => item.id === roomId); return { reservationVersion: source.reservation.version, roomId, roomVersion: room?.version ?? -1, folioVersion: source.folio.version, ...(source.stayId ? { stayId: source.stayId } : {}), ...(source.folioId ? { folioId: source.folioId } : {}) } }
function evidenceMatchesSource(evidence: ArrivalEvidenceRecord, pins: ArrivalSourcePins) { const previous = evidence.sourcePins; if (!previous) return true; if (evidence.kind === 'reservation-check') return previous.reservationVersion === pins.reservationVersion; if (evidence.kind === 'folio-clearance') return previous.folioVersion === pins.folioVersion; if (evidence.kind === 'room-inspection' || evidence.kind === 'occupancy-check') return previous.roomId === pins.roomId && previous.roomVersion === pins.roomVersion; return previous.reservationVersion === pins.reservationVersion && previous.roomId === pins.roomId && previous.roomVersion === pins.roomVersion && previous.folioVersion === pins.folioVersion }
interface EscalateArrival { id: string; expectedRevision: number; role: ArrivalControlRole; reservationId: string; manager: string; frontDeskOwner: string; housekeepingOwner: string; replacementRoom: string; folioAction: string; asOf: string; reason: string }

export function escalateArrivalIntervention(state: ArrivalPortfolioState, command: EscalateArrival) {
  if (state.interventions.some((item) => item.id === command.id)) return state
  if (state.revision !== command.expectedRevision) throw new ArrivalControlError('STALE_REVISION', 'Arrival workload changed. Refresh before escalation.', command.reservationId)
  if (!arrivalCapabilities(command.role).canApproveReplacement) throw new ArrivalControlError('UNAUTHORIZED', 'Only the duty manager can approve replacement inventory and ownership handoff.', command.reservationId)
  const arrival = state.arrivals.find((item) => item.reservationId === command.reservationId)
  if (!arrival) throw new Error('Upcoming arrival was not found.')
  const urgency = arrivalUrgencyWorkload([arrival], command.asOf)[0]
  if (urgency?.urgency !== 'critical' || arrival.roomStatus !== 'blocked') throw new ArrivalControlError('ARRIVAL_INELIGIBLE', 'Only a critical blocked arrival can be escalated.', command.reservationId)
  if (!command.replacementRoom.trim() || !command.folioAction.trim()) throw new Error('Replacement room and folio intervention are required.')
  if (command.reason.trim().length < 20) throw new Error('Guest-impact escalation reason is required.')
  const next = structuredClone(state)
  const target = next.arrivals.find((item) => item.reservationId === arrival.reservationId)
  if (!target) throw new Error('Arrival disappeared during the coordinated update.')
  next.interventions.push({ id: command.id, reservationId: arrival.reservationId, guestName: arrival.guestName, previousFrontDeskOwner: arrival.frontDeskOwner, previousHousekeepingOwner: arrival.housekeepingOwner, frontDeskOwner: command.frontDeskOwner, housekeepingOwner: command.housekeepingOwner, manager: command.manager, replacementRoom: command.replacementRoom, folioAction: command.folioAction, reason: command.reason.trim(), status: 'manager-escalated', immutable: true })
  target.frontDeskOwner = command.frontDeskOwner
  target.housekeepingOwner = command.housekeepingOwner
  target.operationalOwner = command.manager
  target.replacementAvailable = true
  const source = next.operationalSources.find((item) => item.reservationId === command.reservationId)
  if (!source) throw new Error('Arrival source records were not found.')
  source.reservation.assignedRoomId = command.replacementRoom
  source.reservation.version += 1
  if (!source.rooms.some((item) => item.id === command.replacementRoom)) source.rooms.push({ id: command.replacementRoom, version: 1, status: 'ready', occupied: false })
  next.revision += 1
  return next
}

interface ReviseArrivalRoom { id: string; expectedRevision: number; role: ArrivalControlRole; reservationId: string; replacementRoom: string; changedOn: string; reason: string; roomRevision: true }
export function reviseArrivalReplacement(state: ArrivalPortfolioState, command: ReviseArrivalRoom) {
  if (state.interventions.some((item) => item.id === command.id)) return state
  if (state.revision !== command.expectedRevision) throw new ArrivalControlError('STALE_REVISION', 'Arrival workload changed. Refresh before revising the room.', command.reservationId)
  if (!arrivalCapabilities(command.role).canApproveReplacement) throw new ArrivalControlError('UNAUTHORIZED', 'Only the duty manager can revise replacement inventory.', command.reservationId)
  const previous = [...state.interventions].reverse().find((item) => item.reservationId === command.reservationId)
  if (previous?.status !== 'manager-escalated' || state.releases.some((item) => item.reservationId === command.reservationId)) throw new ArrivalControlError('ARRIVAL_INELIGIBLE', 'Only an active unreleased intervention can change rooms.', command.reservationId)
  if (!command.replacementRoom.trim() || command.replacementRoom === previous.replacementRoom || command.reason.trim().length < 20) throw new Error('A different replacement room and a specific reason are required.')
  const next = structuredClone(state)
  next.interventions.push({ ...previous, id: command.id, replacementRoom: command.replacementRoom.trim(), reason: command.reason.trim(), immutable: true })
  const source = next.operationalSources.find((item) => item.reservationId === command.reservationId)
  if (!source) throw new Error('Arrival source records were not found.')
  source.reservation.assignedRoomId = command.replacementRoom.trim()
  source.reservation.version += 1
  if (!source.rooms.some((item) => item.id === command.replacementRoom.trim())) source.rooms.push({ id: command.replacementRoom.trim(), version: 1, status: 'ready', occupied: false })
  for (const evidence of state.evidence.filter((item) => item.interventionId === previous.id)) {
    next.invalidations.push({ id: `${command.id}:${evidence.id}`, reservationId: command.reservationId, evidenceId: evidence.id, kind: evidence.kind, team: evidence.team, actor: evidence.actor, sourceRevision: evidence.sourceRevision, invalidatedByInterventionId: command.id, change: `Replacement room ${previous.replacementRoom} changed to ${command.replacementRoom.trim()}: ${command.reason.trim()}`, invalidatedOn: command.changedOn, replacementRequired: true, immutable: true })
  }
  next.revision += 1
  return next
}

interface ReviseArrivalSource { id: string; expectedRevision: number; role: ArrivalControlRole; reservationId: string; source: ArrivalSourceRevision['source']; sourceReference: string; reason: string; actor: string; revisedOn: string }
export function reviseArrivalSource(state: ArrivalPortfolioState, command: ReviseArrivalSource) {
  if (state.sourceRevisions.some((item) => item.id === command.id)) return state
  if (state.revision !== command.expectedRevision) throw new ArrivalControlError('STALE_REVISION', 'Arrival workload changed. Refresh before revising source evidence.', command.reservationId)
  const requiredRole = command.source === 'folio' ? 'Front Desk Agent' : 'Housekeeping Coordinator'
  if (command.role !== requiredRole) throw new ArrivalControlError('UNAUTHORIZED', `Only the ${requiredRole.toLowerCase()} can report this source revision.`, command.reservationId)
  const intervention = [...state.interventions].reverse().find((item) => item.reservationId === command.reservationId)
  if (!intervention) throw new ArrivalControlError('ARRIVAL_INELIGIBLE', 'Only an active unreleased intervention can revise arrival sources.', command.reservationId)
  if (intervention.status !== 'manager-escalated' || state.releases.some((item) => item.reservationId === command.reservationId)) throw new ArrivalControlError('ARRIVAL_INELIGIBLE', 'Only an active unreleased intervention can revise arrival sources.', command.reservationId)
  if (!command.sourceReference.trim() || command.reason.trim().length < 20) throw new Error('Source reference and specific change reason are required.')
  if (state.sourceRevisions.some((item) => item.reservationId === command.reservationId && item.source === command.source && item.sourceReference === command.sourceReference)) throw new Error('This source revision has already been recorded.')
  const affectedKinds: ArrivalEvidenceKind[] = command.source === 'folio' ? ['folio-clearance', 'manager-review'] : ['room-inspection', 'occupancy-check', 'manager-review']
  const affected = state.evidence.filter((item) => item.interventionId === intervention.id && affectedKinds.includes(item.kind) && !state.invalidations.some((invalidation) => invalidation.evidenceId === item.id))
  const next = structuredClone(state)
  const arrival = next.arrivals.find((item) => item.reservationId === command.reservationId)
  if (!arrival) throw new Error('Arrival disappeared during source revision.')
  const source = next.operationalSources.find((item) => item.reservationId === command.reservationId)
  if (!source) throw new Error('Arrival source records were not found.')
  if (command.source === 'folio') { arrival.folioBlocker = true; source.folio.blocker = true; source.folio.clearanceReference = null; source.folio.version += 1 }
  else { arrival.roomStatus = 'blocked'; const room = source.rooms.find((item) => item.id === intervention.replacementRoom); if (!room) throw new Error('Assigned room source was not found.'); room.status = 'blocked'; room.version += 1 }
  next.sourceRevisions.push({ id: command.id, reservationId: command.reservationId, interventionId: intervention.id, source: command.source, sourceReference: command.sourceReference.trim(), reason: command.reason.trim(), actor: command.actor, revisedOn: command.revisedOn, invalidatedEvidenceIds: affected.map((item) => item.id), immutable: true })
  for (const evidence of affected) next.invalidations.push({ id: `${command.id}:${evidence.id}`, reservationId: command.reservationId, evidenceId: evidence.id, kind: evidence.kind, team: evidence.team, actor: evidence.actor, sourceRevision: evidence.sourceRevision, invalidatedByInterventionId: intervention.id, change: `${command.source} source ${command.sourceReference.trim()}: ${command.reason.trim()}`, invalidatedOn: command.revisedOn, replacementRequired: true, immutable: true })
  next.revision += 1
  return next
}

interface RecordArrivalEvidence { id: string; expectedRevision: number; role: ArrivalControlRole; reservationId: string; kind: ArrivalEvidenceKind; actor: string; evidenceReference: string; recordedOn: string }
export function recordArrivalEvidence(state: ArrivalPortfolioState, command: RecordArrivalEvidence) {
  if (state.evidence.some((item) => item.id === command.id)) return state
  if (state.revision !== command.expectedRevision) throw new ArrivalControlError('STALE_REVISION', 'Arrival workload changed. Refresh before recording evidence.', command.reservationId)
  const intervention = [...state.interventions].reverse().find((item) => item.reservationId === command.reservationId && item.status === 'manager-escalated')
  if (!intervention) throw new Error('An active manager intervention is required.')
  const expectedTeam = command.kind === 'room-inspection' ? 'Housekeeping Coordinator' : command.kind === 'manager-review' ? 'Duty Manager' : 'Front Desk Agent'
  if (command.role !== expectedTeam) throw new ArrivalControlError('UNAUTHORIZED', `Only the ${expectedTeam.toLocaleLowerCase()} can record this evidence.`, command.reservationId)
  if (!command.evidenceReference.trim()) throw new ArrivalControlError('EVIDENCE_INCOMPLETE', 'A durable evidence reference is required.', command.reservationId)
  const next = structuredClone(state)
  const source = next.operationalSources.find((item) => item.reservationId === command.reservationId)
  const room = source?.rooms.find((item) => item.id === intervention.replacementRoom)
  if (!source || !room || source.reservation.assignedRoomId !== intervention.replacementRoom) throw new ArrivalControlError('EVIDENCE_INCOMPLETE', 'Current reservation and assigned room source must agree.', command.reservationId)
  if (command.kind === 'folio-clearance') { source.folio.blocker = false; source.folio.clearanceReference = command.evidenceReference.trim(); source.folio.version += 1 }
  if (command.kind === 'room-inspection') { room.status = 'ready'; room.version += 1 }
  if (command.kind === 'occupancy-check' && (room.occupied || room.status !== 'ready')) throw new ArrivalControlError('EVIDENCE_INCOMPLETE', 'Current room source is occupied or blocked.', command.reservationId)
  if (command.kind === 'manager-review' && (source.folio.blocker || room.status !== 'ready' || room.occupied)) throw new ArrivalControlError('EVIDENCE_INCOMPLETE', 'Current room and folio sources are not ready for manager review.', command.reservationId)
  next.evidence.push({ id: command.id, reservationId: command.reservationId, interventionId: intervention.id, kind: command.kind, team: command.role === 'Housekeeping Coordinator' ? 'housekeeping' : command.role === 'Duty Manager' ? 'duty-management' : 'front-desk', actor: command.actor, evidenceReference: command.evidenceReference.trim(), replacementRoom: intervention.replacementRoom, sourceRevision: state.revision, sourcePins: sourcePins(source, room.id), recordedOn: command.recordedOn, immutable: true })
  next.revision += 1
  return next
}

interface ReleaseArrival { id: string; expectedRevision: number; role: ArrivalControlRole; reservationId: string; frontDeskAcknowledgement: string; housekeepingAcknowledgement: string; replacementRoom: string; originalRoomDisposition: string; folioClearanceReference: string; occupancyReference: string; noShowAuditReference: string; releasedBy: string; releasedOn: string }
export function releaseOperationalArrival(state: ArrivalPortfolioState, command: ReleaseArrival) {
  if (state.releases.some((item) => item.id === command.id)) return state
  if (state.revision !== command.expectedRevision) throw new ArrivalControlError('STALE_REVISION', 'Arrival workload changed. Refresh before operational release.', command.reservationId)
  if (!arrivalCapabilities(command.role).canReleaseArrival) throw new ArrivalControlError('UNAUTHORIZED', 'Only the duty manager can authorize final arrival release.', command.reservationId)
  const arrival = state.arrivals.find((item) => item.reservationId === command.reservationId)
  const intervention = [...state.interventions].reverse().find((item) => item.reservationId === command.reservationId)
  if (!arrival || intervention?.status !== 'manager-escalated') throw new Error('An active manager intervention is required.')
  if (command.replacementRoom !== intervention.replacementRoom || !command.frontDeskAcknowledgement || !command.housekeepingAcknowledgement || !command.originalRoomDisposition || !command.folioClearanceReference || !command.occupancyReference || !command.noShowAuditReference) throw new ArrivalControlError('EVIDENCE_INCOMPLETE', 'Room, housekeeping, folio, occupancy, and no-show evidence must be complete.', command.reservationId)
  const source = state.operationalSources.find((item) => item.reservationId === command.reservationId)
  const room = source?.rooms.find((item) => item.id === command.replacementRoom)
  if (!source || !room || source.reservation.assignedRoomId !== command.replacementRoom || room.occupied || room.status !== 'ready') throw new ArrivalControlError('EVIDENCE_INCOMPLETE', 'Assigned room is no longer ready and vacant in the operational source.', command.reservationId)
  const currentPins = sourcePins(source, room.id)
  const governedEvidence = state.evidence.filter((item) => item.reservationId === command.reservationId)
  if (governedEvidence.length > 0 || state.sourceRevisions.some((item) => item.reservationId === command.reservationId)) {
    const currentEvidence = governedEvidence.filter((item) => item.interventionId === intervention.id && item.replacementRoom === intervention.replacementRoom && evidenceMatchesSource(item, currentPins) && !state.invalidations.some((invalidation) => invalidation.evidenceId === item.id))
    const missingKinds = (['reservation-check', 'folio-clearance', 'room-inspection', 'occupancy-check', 'manager-review'] as ArrivalEvidenceKind[]).filter((kind) => !currentEvidence.some((item) => item.kind === kind))
    if (missingKinds.length > 0) throw new ArrivalControlError('EVIDENCE_INCOMPLETE', `Independent arrival evidence is missing: ${missingKinds.join(', ')}.`, command.reservationId)
    if (source.folio.blocker) throw new ArrivalControlError('EVIDENCE_INCOMPLETE', 'Current folio source still blocks arrival release.', command.reservationId)
    if (state.sourceRevisions.some((item) => item.reservationId === command.reservationId && item.source === 'folio') && currentEvidence.filter((item) => item.kind === 'folio-clearance').at(-1)?.evidenceReference !== command.folioClearanceReference) throw new ArrivalControlError('EVIDENCE_INCOMPLETE', 'Release must reference the current independently verified folio clearance.', command.reservationId)
  }
  const next = structuredClone(state)
  const target = next.arrivals.find((item) => item.reservationId === arrival.reservationId)
  const nextIntervention = next.interventions.find((item) => item.id === intervention.id)
  if (!target || !nextIntervention) throw new Error('Arrival records disappeared during release.')
  const reconciliation: ArrivalReconciliationSnapshot = {
    reservation: { reservationId: arrival.reservationId, guestName: arrival.guestName, ready: true },
    room: { replacementRoom: command.replacementRoom, originalRoomDisposition: command.originalRoomDisposition, ready: true },
    housekeeping: { acknowledgement: command.housekeepingAcknowledgement, ready: true },
    folio: { clearanceReference: command.folioClearanceReference, blockerCleared: true },
    occupancy: { reference: command.occupancyReference, conflictFree: true },
    noShow: { auditReference: command.noShowAuditReference, reconciled: true },
  }
  next.releases.push({ ...command, interventionId: intervention.id, reconciliation, sourcePins: currentPins, immutable: true })
  target.roomStatus = 'ready'
  target.folioBlocker = false
  target.operationalOwner = 'Front desk'
  target.interventionOpenedAt = null
  nextIntervention.status = 'completed'
  const nextSource = next.operationalSources.find((item) => item.reservationId === command.reservationId)
  if (nextSource && governedEvidence.length === 0) { nextSource.folio.blocker = false; nextSource.folio.clearanceReference = command.folioClearanceReference; nextSource.folio.version += 1 }
  const nextRoom = nextSource?.rooms.find((item) => item.id === command.replacementRoom)
  if (nextRoom) { nextRoom.occupied = true; nextRoom.version += 1 }
  next.revision += 1
  return next
}

export function queryArrivalInterventionHistory(state: ArrivalPortfolioState, reservationId: string) {
  return [
    ...state.interventions.filter((item) => item.reservationId === reservationId).map((item) => ({ kind: 'manager-intervention' as const, occurredOn: item.id, actor: item.manager, evidence: [item.replacementRoom, item.folioAction], status: item.status })),
    ...state.releases.filter((item) => item.reservationId === reservationId).map((item) => ({ kind: 'operational-release' as const, occurredOn: item.releasedOn, actor: item.releasedBy, evidence: [item.frontDeskAcknowledgement, item.housekeepingAcknowledgement, item.folioClearanceReference, item.occupancyReference, item.noShowAuditReference], status: 'released' as const })),
  ]
}

export function queryArrivalReleaseLineage(state: ArrivalPortfolioState, reservationId: string) {
  return state.releases.filter((item) => item.reservationId === reservationId).map((item) => ({ releaseId: item.id, interventionId: item.interventionId, releasedOn: item.releasedOn, reconciliation: structuredClone(item.reconciliation) }))
}

export function explainArrivalReadiness(state: ArrivalPortfolioState, reservationId: string) {
  const arrival = state.arrivals.find((item) => item.reservationId === reservationId)
  if (!arrival) return null
  const intervention = [...state.interventions].reverse().find((item) => item.reservationId === reservationId) ?? null
  const release = [...state.releases].reverse().find((item) => item.reservationId === reservationId) ?? null
  const source = state.operationalSources.find((item) => item.reservationId === reservationId)
  const room = source?.rooms.find((item) => item.id === intervention?.replacementRoom)
  const pins = source && intervention ? sourcePins(source, intervention.replacementRoom) : null
  const validEvidence = intervention ? state.evidence.filter((item) => item.reservationId === reservationId && item.interventionId === intervention.id && item.replacementRoom === intervention.replacementRoom && (!pins || evidenceMatchesSource(item, pins)) && !state.invalidations.some((invalidation) => invalidation.evidenceId === item.id)) : []
  const requiredKinds: ArrivalEvidenceKind[] = ['reservation-check', 'folio-clearance', 'room-inspection', 'occupancy-check', 'manager-review']
  const missingEvidence = requiredKinds.filter((kind) => !validEvidence.some((item) => item.kind === kind))
  return {
    reservation: { ready: true, guestName: arrival.guestName },
    room: { ready: release ? true : room?.status === 'ready' && !room.occupied, currentStatus: room?.status ?? arrival.roomStatus, replacementRoom: intervention?.replacementRoom ?? null },
    housekeeping: { ready: Boolean(release?.reconciliation.housekeeping.ready), owner: arrival.housekeepingOwner, acknowledgement: release?.housekeepingAcknowledgement ?? null },
    financial: { ready: !(source?.folio.blocker ?? arrival.folioBlocker), blocker: source?.folio.blocker ?? arrival.folioBlocker, clearanceReference: source?.folio.clearanceReference ?? release?.folioClearanceReference ?? null },
    sourcePins: pins,
    occupancy: { conflict: !release, reference: release?.occupancyReference ?? null },
    interventionState: intervention?.status ?? 'not-started',
    releaseEligible: Boolean(release),
    evidence: validEvidence,
    invalidations: state.invalidations.filter((item) => item.reservationId === reservationId),
    missingEvidence,
    independentlyVerified: missingEvidence.length === 0,
  }
}

export interface ArrivalPersistence { load(): ArrivalPortfolioState | null; save(state: ArrivalPortfolioState): void }
export class BrowserArrivalPersistence implements ArrivalPersistence {
  static key = 'staypilot:arrival-urgency-control:v3'
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'>
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage }
  load() {
    const raw = this.storage.getItem(BrowserArrivalPersistence.key)
    if (!raw) return null
    type SavedRelease = Omit<ArrivalRelease, 'reconciliation'> & { reconciliation?: ArrivalReconciliationSnapshot }
    const saved = JSON.parse(raw) as Omit<ArrivalPortfolioState, 'releases' | 'evidence' | 'invalidations' | 'sourceRevisions' | 'operationalSources'> & { evidence?: ArrivalEvidenceRecord[]; invalidations?: ArrivalEvidenceInvalidation[]; sourceRevisions?: ArrivalSourceRevision[]; operationalSources?: ArrivalOperationalSources[]; releases?: SavedRelease[] }
    const releases = (saved.releases ?? []).map((release): ArrivalRelease => {
      if (release.reconciliation) return { ...release, reconciliation: release.reconciliation }
      const guestName = saved.arrivals.find((arrival) => arrival.reservationId === release.reservationId)?.guestName ?? 'Unknown guest'
      return {
        ...release,
        reconciliation: {
          reservation: { reservationId: release.reservationId, guestName, ready: true },
          room: { replacementRoom: release.replacementRoom, originalRoomDisposition: release.originalRoomDisposition, ready: true },
          housekeeping: { acknowledgement: release.housekeepingAcknowledgement, ready: true },
          folio: { clearanceReference: release.folioClearanceReference, blockerCleared: true },
          occupancy: { reference: release.occupancyReference, conflictFree: true },
          noShow: { auditReference: release.noShowAuditReference, reconciled: true },
        },
      }
    })
    return { ...saved, operationalSources: saved.operationalSources ?? initialSources(saved.arrivals, saved.interventions), evidence: saved.evidence ?? [], invalidations: saved.invalidations ?? [], sourceRevisions: saved.sourceRevisions ?? [], releases }
  }
  save(state: ArrivalPortfolioState) { this.storage.setItem(BrowserArrivalPersistence.key, JSON.stringify(state)) }
}
export class ArrivalPortfolioRepository {
  private readonly persistence: ArrivalPersistence
  constructor(persistence: ArrivalPersistence) { this.persistence = persistence }
  read(): ArrivalPortfolioState { return this.persistence.load() ?? structuredClone(initialArrivalPortfolioState) }
  dispatch(command: EscalateArrival | ReviseArrivalRoom | ReviseArrivalSource | RecordArrivalEvidence | ReleaseArrival) { const current = this.read(); const next = 'occupancyReference' in command ? releaseOperationalArrival(current, command) : 'source' in command ? reviseArrivalSource(current, command) : 'roomRevision' in command ? reviseArrivalReplacement(current, command) : 'kind' in command ? recordArrivalEvidence(current, command) : escalateArrivalIntervention(current, command); if (next !== current) this.persistence.save(next); return next }
}
