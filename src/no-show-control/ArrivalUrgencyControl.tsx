import { useRef, useState } from "react";
import { arrivalUrgencyWorkload } from "./arrival-urgency";
import {
  ArrivalPortfolioRepository,
  BrowserArrivalPersistence,
  explainArrivalReadiness,
  type ArrivalEvidenceKind,
  type ArrivalControlRole,
} from "./arrival-control-domain";

export function ArrivalUrgencyControl() {
  const [repository] = useState(
    () =>
      new ArrivalPortfolioRepository(
        new BrowserArrivalPersistence(localStorage),
      ),
  );
  const [state, setState] = useState(() => repository.read());
  const [role, setRole] = useState<ArrivalControlRole>("Front Desk Agent");
  const [message, setMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  const workload = arrivalUrgencyWorkload(
    state.arrivals,
    "2026-10-20T14:00:00Z",
  );
  const readiness = explainArrivalReadiness(state, "RES-5812");
  const escalate = () => {
    try {
      setState(
        repository.dispatch({
          id: crypto.randomUUID(),
          expectedRevision: state.revision,
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
  const recordEvidence = () => { const kinds: ArrivalEvidenceKind[] = ["reservation-check", "folio-clearance", "room-inspection", "occupancy-check", "manager-review"]; const kind = kinds[state.evidence.length]; if (!kind) return; try { setState(repository.dispatch({ id: crypto.randomUUID(), expectedRevision: state.revision, role, reservationId: "RES-5812", kind, actor: role, evidenceReference: `ARRIVAL-${kind}`, recordedOn: "2026-10-20T14:30:00Z" })); setMessage(`${kind} recorded independently.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Arrival evidence failed."); } queueMicrotask(() => feedback.current?.focus()); };
  const release = () => {
    try {
      setState(
        repository.dispatch({
          id: crypto.randomUUID(),
          expectedRevision: state.revision,
          role,
          reservationId: "RES-5812",
          frontDeskAcknowledgement: "FD-ACK-5812",
          housekeepingAcknowledgement: "HK-ACK-5812",
          replacementRoom: "ROOM-824",
          originalRoomDisposition: "ROOM-512 transferred to maintenance",
          folioClearanceReference: "FOLIO-CLEAR-5812",
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
      <button
        disabled={role !== "Duty Manager" || state.interventions.length > 0}
        onClick={escalate}
      >
        Approve replacement and escalate arrival
      </button>
      <button disabled={state.interventions.length === 0 || state.evidence.length >= 5 || (state.evidence.length === 2 && role !== "Housekeeping Coordinator") || (state.evidence.length === 4 && role !== "Duty Manager") || (![2, 4].includes(state.evidence.length) && role !== "Front Desk Agent")} onClick={recordEvidence}>Record next team evidence</button>
      <button
        disabled={
          role !== "Duty Manager" ||
          state.interventions.length === 0 ||
          (state.evidence.length > 0 && !readiness?.independentlyVerified) ||
          state.releases.length > 0
        }
        onClick={release}
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
      <ol aria-label="Independent arrival evidence">{state.evidence.map((item) => <li key={item.id}>{item.kind} · {item.team} · {item.actor} · {item.evidenceReference} · revision {item.sourceRevision}</li>)}</ol>
      <ol aria-label="Arrival release history">
        {state.releases.map((item) => (
          <li key={item.id}>
            {item.reservationId} · room{" "}
            {item.reconciliation.room.replacementRoom} · occupancy{" "}
            {item.reconciliation.occupancy.reference} · folio cleared ·
            reconciled · released {item.releasedOn}
          </li>
        ))}
      </ol>
    </section>
  );
}
