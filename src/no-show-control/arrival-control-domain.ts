import { arrivalUrgencyWorkload, seededUpcomingArrivals, type UpcomingArrivalRecord } from './arrival-urgency'

export type ArrivalControlRole = 'Front Desk Agent' | 'Duty Manager'
export type ArrivalControlErrorCode = 'STALE_REVISION' | 'UNAUTHORIZED' | 'ARRIVAL_INELIGIBLE' | 'EVIDENCE_INCOMPLETE'
export class ArrivalControlError extends Error { readonly code: ArrivalControlErrorCode; readonly reservationId: string; constructor(code: ArrivalControlErrorCode, message: string, reservationId: string) { super(message); this.code = code; this.reservationId = reservationId; this.name = 'ArrivalControlError' } }
export function arrivalCapabilities(role: ArrivalControlRole) {
  return { canApproveReplacement: role === 'Duty Manager', canReleaseArrival: role === 'Duty Manager' } as const
}
export interface CoordinatedArrival extends UpcomingArrivalRecord { frontDeskOwner: string; housekeepingOwner: string }
export interface ArrivalIntervention { id: string; reservationId: string; guestName: string; previousFrontDeskOwner: string; previousHousekeepingOwner: string; frontDeskOwner: string; housekeepingOwner: string; manager: string; replacementRoom: string; folioAction: string; reason: string; status: 'manager-escalated' | 'completed'; immutable: true }
export interface ArrivalReconciliationSnapshot { reservation: { reservationId: string; guestName: string; ready: true }; room: { replacementRoom: string; originalRoomDisposition: string; ready: true }; housekeeping: { acknowledgement: string; ready: true }; folio: { clearanceReference: string; blockerCleared: true }; occupancy: { reference: string; conflictFree: true }; noShow: { auditReference: string; reconciled: true } }
export interface ArrivalRelease { id: string; reservationId: string; interventionId: string; frontDeskAcknowledgement: string; housekeepingAcknowledgement: string; replacementRoom: string; originalRoomDisposition: string; folioClearanceReference: string; occupancyReference: string; noShowAuditReference: string; reconciliation: ArrivalReconciliationSnapshot; releasedBy: string; releasedOn: string; immutable: true }
export interface ArrivalPortfolioState { revision: number; arrivals: CoordinatedArrival[]; interventions: ArrivalIntervention[]; releases: ArrivalRelease[] }
export const initialArrivalPortfolioState: ArrivalPortfolioState = { revision: 0, arrivals: seededUpcomingArrivals.map((item) => ({ ...structuredClone(item), frontDeskOwner: item.operationalOwner === 'Front desk' ? item.operationalOwner : 'Front desk west', housekeepingOwner: 'Housekeeping dispatch' })), interventions: [], releases: [] }
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
  next.releases.push({ ...command, interventionId: intervention.id, reconciliation, immutable: true })
  target.roomStatus = 'ready'
  target.folioBlocker = false
  target.operationalOwner = 'Front desk'
  target.interventionOpenedAt = null
  nextIntervention.status = 'completed'
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
  return {
    reservation: { ready: true, guestName: arrival.guestName },
    room: { ready: arrival.roomStatus === 'ready' || Boolean(intervention?.replacementRoom), currentStatus: arrival.roomStatus, replacementRoom: intervention?.replacementRoom ?? null },
    housekeeping: { ready: Boolean(release?.reconciliation.housekeeping.ready), owner: arrival.housekeepingOwner, acknowledgement: release?.housekeepingAcknowledgement ?? null },
    financial: { ready: !arrival.folioBlocker, blocker: arrival.folioBlocker, clearanceReference: release?.folioClearanceReference ?? null },
    occupancy: { conflict: !release, reference: release?.occupancyReference ?? null },
    interventionState: intervention?.status ?? 'not-started',
    releaseEligible: Boolean(release),
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
    const saved = JSON.parse(raw) as Omit<ArrivalPortfolioState, 'releases'> & { releases?: SavedRelease[] }
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
    return { ...saved, releases }
  }
  save(state: ArrivalPortfolioState) { this.storage.setItem(BrowserArrivalPersistence.key, JSON.stringify(state)) }
}
export class ArrivalPortfolioRepository {
  private readonly persistence: ArrivalPersistence
  constructor(persistence: ArrivalPersistence) { this.persistence = persistence }
  read(): ArrivalPortfolioState { return this.persistence.load() ?? structuredClone(initialArrivalPortfolioState) }
  dispatch(command: EscalateArrival | ReleaseArrival) { const current = this.read(); const next = 'occupancyReference' in command ? releaseOperationalArrival(current, command) : escalateArrivalIntervention(current, command); if (next !== current) this.persistence.save(next); return next }
}
