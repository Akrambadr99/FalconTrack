import { useEffect, useRef, useState } from "react";
import { arrivalUrgencyWorkload } from "./arrival-urgency";
import { AuthoritativeArrivalRepository } from './arrival-source-boundary';
import {
  explainArrivalReadiness,
  type ArrivalEvidenceKind,
  type ArrivalControlRole,
} from "./arrival-control-domain";

export function ArrivalUrgencyControl() {
  const [repository] = useState(
    () =>
      new AuthoritativeArrivalRepository(localStorage),
  );
  const [state, setState] = useState(() => repository.read());
  const [role, setRole] = useState<ArrivalControlRole>("Front Desk Agent");
  const [message, setMessage] = useState("");
  const [replacementRoom, setReplacementRoom] = useState("ROOM-826");
  const [sourceReference, setSourceReference] = useState('FOLIO-REV-5812');
  const [sourceReason, setSourceReason] = useState('Source record changed after the previous team verification.');
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message) feedback.current?.focus(); }, [message]);
  const workload = arrivalUrgencyWorkload(
    state.arrivals,
    "2026-10-20T14:00:00Z",
  );
  const readiness = explainArrivalReadiness(state, "RES-5812");
  const escalate = async () => {
    try {
      setState(
        await repository.dispatchCoordinated({
          id: crypto.randomUUID(),
          expectedRevision: state.revision,
          expectedWorkspaceRevision: state.workspaceRevision,
          role,
          reservationId: "RES-5812",
          manager: "Duty manager north",
          frontDeskOwner: "Arrival lead",
          housekeepingOwner: "Rooms recovery team",
          replacementRoom: "ROOM-824",
          folioAction: "Priority deposit clearance",
          asOf: "2026-10-20T14:00:00Z",
          reason:
            "Guest arrival is within one hour with room and folio blockers.",
        }),
      );
      setMessage(
        "Replacement room approved and arrival intervention escalated.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Arrival escalation failed.",
      );
    }
    queueMicrotask(() => feedback.current?.focus());
  };
  const recordEvidence = async () => { const kind: ArrivalEvidenceKind | undefined = readiness?.missingEvidence[0]; if (!kind) return; try { setState(await repository.dispatchCoordinated({ id: crypto.randomUUID(), expectedRevision: state.revision, expectedWorkspaceRevision: state.workspaceRevision, role, reservationId: "RES-5812", kind, actor: role, evidenceReference: `ARRIVAL-${kind}-${String(state.revision)}`, recordedOn: "2026-10-20T14:30:00Z" })); setMessage(`${kind} recorded independently.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Arrival evidence failed."); } queueMicrotask(() => feedback.current?.focus()); };
  const reviseRoom = async () => { try { setState(await repository.dispatchCoordinated({ id: crypto.randomUUID(), expectedRevision: state.revision, expectedWorkspaceRevision: state.workspaceRevision, role, reservationId: "RES-5812", replacementRoom, changedOn: "2026-10-20T14:35:00Z", reason: "Prior replacement room became unavailable before release.", roomRevision: true })); setMessage("Replacement room changed. Each affected team must resubmit evidence."); } catch (error) { setMessage(error instanceof Error ? error.message : "Room revision failed."); } queueMicrotask(() => feedback.current?.focus()); };
  const reviseSource = async (source: 'folio' | 'housekeeping') => { try { setState(await repository.dispatchCoordinated({ id: crypto.randomUUID(), expectedRevision: state.revision, expectedWorkspaceRevision: state.workspaceRevision, role, reservationId: 'RES-5812', source, sourceReference, reason: sourceReason, actor: role, revisedOn: '2026-10-20T14:38:00Z' })); setMessage(`${source} source revised. Only affected team evidence must be resubmitted.`); } catch (error) { setMessage(error instanceof Error ? error.message : 'Arrival source revision failed.'); } queueMicrotask(() => feedback.current?.focus()); };
  const release = async () => {
    try {
      setState(
        await repository.dispatchCoordinated({
          id: crypto.randomUUID(),
          expectedRevision: state.revision,
          expectedWorkspaceRevision: state.workspaceRevision,
          role,
          reservationId: "RES-5812",
          frontDeskAcknowledgement: "FD-ACK-5812",
          housekeepingAcknowledgement: "HK-ACK-5812",
          replacementRoom: state.interventions.at(-1)?.replacementRoom ?? "ROOM-824",
          originalRoomDisposition: "ROOM-512 transferred to maintenance",
          folioClearanceReference: state.sourceRevisions.some((item) => item.reservationId === 'RES-5812' && item.source === 'folio') ? readiness?.evidence.filter((item) => item.kind === 'folio-clearance').at(-1)?.evidenceReference ?? '' : "FOLIO-CLEAR-5812",
          occupancyReference: "OCC-824-5812",
          noShowAuditReference: "NOSHOW-RECON-5812",
          releasedBy: "Duty manager north",
          releasedOn: "2026-10-20T14:45:00Z",
        }),
      );
      setMessage(
        "Arrival released after room, folio, occupancy, and handoff reconciliation.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Arrival release failed.",
      );
    }
    queueMicrotask(() => feedback.current?.focus());
  };
  return (
    <section className="card" aria-label="Arrival urgency workload">
      <h2>Upcoming arrival urgency</h2>
      {state.unresolvedSource && <p role="alert">{state.unresolvedSource}</p>}
      <label>
        Arrival control role
        <select
          value={role}
          onChange={(event) => {
            setRole(event.target.value as ArrivalControlRole);
          }}
        >
          <option>Front Desk Agent</option>
          <option>Housekeeping Coordinator</option>
          <option>Duty Manager</option>
        </select>
      </label>
      {workload.map((item) => {
        const source = state.arrivals.find(
          (arrival) => arrival.reservationId === item.reservationId,
        );
        if (!source) return null;
        return (
          <p key={item.reservationId}>
            {item.reservationId} · {item.guestName} · {item.urgency} ·{" "}
            {item.minutesToArrival} minutes · front desk {source.frontDeskOwner}{" "}
            · housekeeping {source.housekeepingOwner} · {item.nextAction}
          </p>
        );
      })}
      {readiness && (
        <p aria-label="Arrival reconciliation readiness">
          Room {readiness.room.ready ? "ready" : "blocked"} · housekeeping{" "}
          {readiness.housekeeping.ready ? "ready" : "pending"} · financial{" "}
          {readiness.financial.ready ? "ready" : "blocked"} · occupancy{" "}
          {readiness.occupancy.conflict ? "unreconciled" : "reconciled"} ·
          intervention {readiness.interventionState} · {readiness.missingEvidence.length > 0 ? `missing ${readiness.missingEvidence.join(", ")}` : "independently verified"}
        </p>
      )}
      {readiness?.sourcePins && <p aria-label="Arrival operational source versions">Reservation version {readiness.sourcePins.reservationVersion} · assigned room {readiness.sourcePins.roomId} version {readiness.sourcePins.roomVersion} · folio version {readiness.sourcePins.folioVersion}</p>}
      <section aria-label="Arrival room availability"><h3>Room operational obligations</h3><p>Physical room readiness is checked separately from reservation dates, maintenance and housekeeping.</p><ul>{state.operationalSources.find((item) => item.reservationId === 'RES-5812')?.rooms.filter((item) => item.id === (readiness?.room.replacementRoom ?? 'ROOM-824')).map((room) => <li key={room.id}>{room.id} · {room.availabilityBlockers?.length ? room.availabilityBlockers.join(' ') : 'No outstanding reservation, maintenance or housekeeping obligation.'}</li>)}</ul></section>      <p aria-label="Arrival authoritative records">RES-5812 · guest-5812 · stay-5812 · {state.operationalSources.find((item) => item.reservationId === 'RES-5812')?.reservation.assignedRoomId ?? 'room unresolved'} · folio-5812 · {state.releases.length > 0 ? 'checked-in' : 'reserved'}</p>
      <button onClick={() => { try { setState(repository.read()); setMessage('Current reservation, room and folio records loaded.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Authoritative records could not be loaded.'); } queueMicrotask(() => feedback.current?.focus()); }}>Refresh authoritative records</button>
      <button
        disabled={role !== "Duty Manager" || state.interventions.length > 0}
        onClick={() => { void escalate(); }}
      >
        Approve replacement and escalate arrival
      </button>
      <label>New replacement room <input value={replacementRoom} onChange={(event) => { setReplacementRoom(event.target.value); }} /></label>
      <button disabled={role !== "Duty Manager" || state.interventions.length === 0 || state.releases.length > 0} onClick={() => { void reviseRoom(); }}>Revise replacement room</button>
      <fieldset><legend>Revised arrival source</legend><label>Source reference<input value={sourceReference} onChange={(event) => { setSourceReference(event.target.value); }} /></label><label>Source change reason<input value={sourceReason} onChange={(event) => { setSourceReason(event.target.value); }} /></label><button disabled={role !== 'Front Desk Agent' || state.interventions.length === 0 || state.releases.length > 0} onClick={() => { void reviseSource('folio'); }}>Record revised folio source</button><button disabled={role !== 'Housekeeping Coordinator' || state.interventions.length === 0 || state.releases.length > 0} onClick={() => { void reviseSource('housekeeping'); }}>Record revised housekeeping source</button></fieldset>
      <button disabled={state.interventions.length === 0 || !readiness?.missingEvidence.length || (readiness.missingEvidence[0] === "room-inspection" && role !== "Housekeeping Coordinator") || (readiness.missingEvidence[0] === "manager-review" && role !== "Duty Manager") || (!["room-inspection", "manager-review"].includes(readiness.missingEvidence[0] ?? "") && role !== "Front Desk Agent")} onClick={() => { void recordEvidence(); }}>Record next team evidence</button>
      <button
        disabled={
          role !== "Duty Manager" ||
          state.interventions.length === 0 ||
          (state.evidence.length > 0 && !readiness?.independentlyVerified) ||
          state.releases.length > 0
        }
        onClick={() => { void release(); }}
      >
        Release arrival after final reconciliation
      </button>
      {message && (
        <p ref={feedback} tabIndex={-1} role="status">
          {message}
        </p>
      )}
      <ol aria-label="Arrival escalation history">
        {state.interventions.map((item) => (
          <li key={item.id}>
            {item.reservationId} · room {item.replacementRoom} ·{" "}
            {item.frontDeskOwner} / {item.housekeepingOwner} · {item.status}
          </li>
        ))}
      </ol>
      <ol aria-label="Independent arrival evidence">{state.evidence.map((item) => <li key={item.id}>{item.kind} · {item.team} · {item.actor} · {item.evidenceReference} · revision {item.sourceRevision}{item.sourcePins ? ` · room ${item.sourcePins.roomId} v${String(item.sourcePins.roomVersion)} · folio v${String(item.sourcePins.folioVersion)}` : ''}</li>)}</ol>
      <ol aria-label="Invalidated arrival evidence">{state.invalidations.map((item) => <li key={item.id}>{item.kind} · {item.team} must resubmit · original {item.actor} revision {item.sourceRevision} · {item.change} · {item.invalidatedOn}</li>)}</ol>
      <ol aria-label="Arrival source revision history">{state.sourceRevisions.map((item) => <li key={item.id}>{item.source} · {item.sourceReference} · {item.reason} · invalidated {item.invalidatedEvidenceIds.length} prior verifications</li>)}</ol>
      <ol aria-label="Arrival release history">
        {state.releases.map((item) => (
          <li key={item.id}>
            {item.reservationId} · room{" "}
            {item.reconciliation.room.replacementRoom} · occupancy{" "}
            {item.reconciliation.occupancy.reference} · folio cleared ·
            reconciled · released {item.releasedOn}{item.sourcePins ? ` · reservation v${String(item.sourcePins.reservationVersion)} · room v${String(item.sourcePins.roomVersion)} · folio v${String(item.sourcePins.folioVersion)}` : ''}
          </li>
        ))}
      </ol>
    </section>
  );
}
