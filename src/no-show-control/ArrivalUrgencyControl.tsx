/* eslint-disable react-refresh/only-export-components */
import { useRef, useState } from 'react'
import { arrivalUrgencyWorkload, seededUpcomingArrivals, type UpcomingArrivalRecord } from './arrival-urgency'

export type ArrivalControlRole = 'Front Desk Agent' | 'Duty Manager'
export interface CoordinatedArrival extends UpcomingArrivalRecord { frontDeskOwner: string; housekeepingOwner: string }
export interface ArrivalIntervention { id: string; reservationId: string; guestName: string; previousFrontDeskOwner: string; previousHousekeepingOwner: string; frontDeskOwner: string; housekeepingOwner: string; manager: string; replacementRoom: string; folioAction: string; reason: string; status: 'manager-escalated' | 'completed'; immutable: true }
export interface ArrivalRelease { id: string; reservationId: string; interventionId: string; frontDeskAcknowledgement: string; housekeepingAcknowledgement: string; replacementRoom: string; originalRoomDisposition: string; folioClearanceReference: string; occupancyReference: string; noShowAuditReference: string; releasedBy: string; releasedOn: string; immutable: true }
export interface ArrivalPortfolioState { revision: number; arrivals: CoordinatedArrival[]; interventions: ArrivalIntervention[]; releases: ArrivalRelease[] }
export const initialArrivalPortfolioState: ArrivalPortfolioState = { revision: 0, arrivals: seededUpcomingArrivals.map((item) => ({ ...structuredClone(item), frontDeskOwner: item.operationalOwner === 'Front desk' ? item.operationalOwner : 'Front desk west', housekeepingOwner: 'Housekeeping dispatch' })), interventions: [], releases: [] }
interface EscalateArrival { id: string; expectedRevision: number; role: ArrivalControlRole; reservationId: string; manager: string; frontDeskOwner: string; housekeepingOwner: string; replacementRoom: string; folioAction: string; asOf: string; reason: string }

export function escalateArrivalIntervention(state: ArrivalPortfolioState, command: EscalateArrival) {
  if (state.interventions.some((item) => item.id === command.id)) return state
  if (state.revision !== command.expectedRevision) throw new Error('Arrival workload changed. Refresh before escalation.')
  if (command.role !== 'Duty Manager') throw new Error('Only the duty manager can approve replacement inventory and ownership handoff.')
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
  if (command.role !== 'Duty Manager') throw new Error('Only the duty manager can authorize final arrival release.')
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

export class ArrivalPortfolioRepository {
  static key = 'staypilot:arrival-urgency-control:v2'
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'>
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage }
  read(): ArrivalPortfolioState { const raw = this.storage.getItem(ArrivalPortfolioRepository.key); return raw ? JSON.parse(raw) as ArrivalPortfolioState : structuredClone(initialArrivalPortfolioState) }
  dispatch(command: EscalateArrival | ReleaseArrival) { const current = this.read(); const next = 'occupancyReference' in command ? releaseOperationalArrival(current, command) : escalateArrivalIntervention(current, command); if (next !== current) this.storage.setItem(ArrivalPortfolioRepository.key, JSON.stringify(next)); return next }
}

export function ArrivalUrgencyControl() {
  const [repository] = useState(() => new ArrivalPortfolioRepository(localStorage)); const [state, setState] = useState(() => repository.read()); const [role, setRole] = useState<ArrivalControlRole>('Front Desk Agent'); const [message, setMessage] = useState(''); const feedback = useRef<HTMLParagraphElement>(null); const workload = arrivalUrgencyWorkload(state.arrivals, '2026-10-20T14:00:00Z')
  const escalate = () => { try { setState(repository.dispatch({ id: crypto.randomUUID(), expectedRevision: state.revision, role, reservationId: 'RES-5812', manager: 'Duty manager north', frontDeskOwner: 'Arrival lead', housekeepingOwner: 'Rooms recovery team', replacementRoom: 'ROOM-824', folioAction: 'Priority deposit clearance', asOf: '2026-10-20T14:00:00Z', reason: 'Guest arrival is within one hour with room and folio blockers.' })); setMessage('Replacement room approved and arrival intervention escalated.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Arrival escalation failed.') } queueMicrotask(() => feedback.current?.focus()) }
  const release = () => { try { setState(repository.dispatch({ id: crypto.randomUUID(), expectedRevision: state.revision, role, reservationId: 'RES-5812', frontDeskAcknowledgement: 'FD-ACK-5812', housekeepingAcknowledgement: 'HK-ACK-5812', replacementRoom: 'ROOM-824', originalRoomDisposition: 'ROOM-512 transferred to maintenance', folioClearanceReference: 'FOLIO-CLEAR-5812', occupancyReference: 'OCC-824-5812', noShowAuditReference: 'NOSHOW-RECON-5812', releasedBy: 'Duty manager north', releasedOn: '2026-10-20T14:45:00Z' })); setMessage('Arrival released after room, folio, occupancy, and handoff reconciliation.') } catch (error) { setMessage(error instanceof Error ? error.message : 'Arrival release failed.') } queueMicrotask(() => feedback.current?.focus()) }
  return <section className="card" aria-label="Arrival urgency workload"><h2>Upcoming arrival urgency</h2><label>Arrival control role<select value={role} onChange={(event) => { setRole(event.target.value as ArrivalControlRole) }}><option>Front Desk Agent</option><option>Duty Manager</option></select></label>{workload.map((item) => { const source = state.arrivals.find((arrival) => arrival.reservationId === item.reservationId); if (!source) return null; return <p key={item.reservationId}>{item.reservationId} · {item.guestName} · {item.urgency} · {item.minutesToArrival} minutes · front desk {source.frontDeskOwner} · housekeeping {source.housekeepingOwner} · {item.nextAction}</p> })}<button disabled={role !== 'Duty Manager' || state.interventions.length > 0} onClick={escalate}>Approve replacement and escalate arrival</button><button disabled={role !== 'Duty Manager' || state.interventions.length === 0 || state.releases.length > 0} onClick={release}>Release arrival after final reconciliation</button>{message && <p ref={feedback} tabIndex={-1} role="status">{message}</p>}<ol aria-label="Arrival escalation history">{state.interventions.map((item) => <li key={item.id}>{item.reservationId} · room {item.replacementRoom} · {item.frontDeskOwner} / {item.housekeepingOwner} · {item.status}</li>)}</ol><ol aria-label="Arrival release history">{state.releases.map((item) => <li key={item.id}>{item.reservationId} · room {item.replacementRoom} · occupancy {item.occupancyReference} · released {item.releasedOn}</li>)}</ol></section>
}
