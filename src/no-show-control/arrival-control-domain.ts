import { arrivalUrgencyWorkload, seededUpcomingArrivals, type UpcomingArrivalRecord } from './arrival-urgency'

export type ArrivalControlRole = 'Front Desk Agent' | 'Duty Manager'
export function arrivalCapabilities(role: ArrivalControlRole) {
  return { canApproveReplacement: role === 'Duty Manager', canReleaseArrival: role === 'Duty Manager' } as const
}
export interface CoordinatedArrival extends UpcomingArrivalRecord { frontDeskOwner: string; housekeepingOwner: string }
export interface ArrivalIntervention { id: string; reservationId: string; guestName: string; previousFrontDeskOwner: string; previousHousekeepingOwner: string; frontDeskOwner: string; housekeepingOwner: string; manager: string; replacementRoom: string; folioAction: string; reason: string; status: 'manager-escalated' | 'completed'; immutable: true }
export interface ArrivalRelease { id: string; reservationId: string; interventionId: string; frontDeskAcknowledgement: string; housekeepingAcknowledgement: string; replacementRoom: string; originalRoomDisposition: string; folioClearanceReference: string; occupancyReference: string; noShowAuditReference: string; releasedBy: string; releasedOn: string; immutable: true }
export interface ArrivalPortfolioState { revision: number; arrivals: CoordinatedArrival[]; interventions: ArrivalIntervention[]; releases: ArrivalRelease[] }
export const initialArrivalPortfolioState: ArrivalPortfolioState = { revision: 0, arrivals: seededUpcomingArrivals.map((item) => ({ ...structuredClone(item), frontDeskOwner: item.operationalOwner === 'Front desk' ? item.operationalOwner : 'Front desk west', housekeepingOwner: 'Housekeeping dispatch' })), interventions: [], releases: [] }
interface EscalateArrival { id: string; expectedRevision: number; role: ArrivalControlRole; reservationId: string; manager: string; frontDeskOwner: string; housekeepingOwner: string; replacementRoom: string; folioAction: string; asOf: string; reason: string }

export function escalateArrivalIntervention(state: ArrivalPortfolioState, command: EscalateArrival) {
  if (state.interventions.some((item) => item.id === command.id)) return state
  if (state.revision !== command.expectedRevision) throw new Error('Arrival workload changed. Refresh before escalation.')
  if (!arrivalCapabilities(command.role).canApproveReplacement) throw new Error('Only the duty manager can approve replacement inventory and ownership handoff.')
  const arrival = state.arrivals.find((item) => item.reservationId === command.reservationId)
  if (!arrival) throw new Error('Upcoming arrival was not found.')
  const urgency = arrivalUrgencyWorkload([arrival], command.asOf)[0]
  if (urgency?.urgency !== 'critical' || arrival.roomStatus !== 'blocked') throw new Error('Only a critical blocked arrival can be escalated.')
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
  if (state.revision !== command.expectedRevision) throw new Error('Arrival workload changed. Refresh before operational release.')
  if (!arrivalCapabilities(command.role).canReleaseArrival) throw new Error('Only the duty manager can authorize final arrival release.')
  const arrival = state.arrivals.find((item) => item.reservationId === command.reservationId)
  const intervention = [...state.interventions].reverse().find((item) => item.reservationId === command.reservationId)
  if (!arrival || intervention?.status !== 'manager-escalated') throw new Error('An active manager intervention is required.')
  if (command.replacementRoom !== intervention.replacementRoom || !command.frontDeskAcknowledgement || !command.housekeepingAcknowledgement || !command.originalRoomDisposition || !command.folioClearanceReference || !command.occupancyReference || !command.noShowAuditReference) throw new Error('Room, housekeeping, folio, occupancy, and no-show evidence must be complete.')
  const next = structuredClone(state)
  const target = next.arrivals.find((item) => item.reservationId === arrival.reservationId)
  const nextIntervention = next.interventions.find((item) => item.id === intervention.id)
  if (!target || !nextIntervention) throw new Error('Arrival records disappeared during release.')
  next.releases.push({ ...command, interventionId: intervention.id, immutable: true })
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

export class ArrivalPortfolioRepository {
  static key = 'staypilot:arrival-urgency-control:v2'
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'>
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage }
  read(): ArrivalPortfolioState { const raw = this.storage.getItem(ArrivalPortfolioRepository.key); return raw ? JSON.parse(raw) as ArrivalPortfolioState : structuredClone(initialArrivalPortfolioState) }
  dispatch(command: EscalateArrival | ReleaseArrival) { const current = this.read(); const next = 'occupancyReference' in command ? releaseOperationalArrival(current, command) : escalateArrivalIntervention(current, command); if (next !== current) this.storage.setItem(ArrivalPortfolioRepository.key, JSON.stringify(next)); return next }
}
