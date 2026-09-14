import { useRef, useState } from 'react';
import {
  applyRoomInventoryRefresh,
  ArrivalQueueRepository,
  assignSelectedReadyRoom,
  changeArrivalFilter,
  checkInSelectedArrival,
  claimSelectedArrival,
  toggleArrivalSelection,
  verifySelectedArrivalIdentity,
  visibleArrivals,
  type ArrivalFilter,
  type ArrivalQueueState,
  type ArrivalRole,
} from './arrival-queue';

const actors: Record<ArrivalRole, string> = {
  'Front Desk': 'desk-a',
  'Duty Manager': 'manager-a',
  'Housekeeping Coordinator': 'housekeeping-a',
};

export function ArrivalQueuePage() {
  const [repository] = useState(() => new ArrivalQueueRepository(localStorage));
  const [state, setState] = useState<ArrivalQueueState>(() => repository.read());
  const [role, setRole] = useState<ArrivalRole>('Front Desk');
  const [message, setMessage] = useState('');
  const [feedbackTone, setFeedbackTone] = useState<'success' | 'error'>('success');
  const feedback = useRef<HTMLParagraphElement>(null);
  const meta = () => ({ id: crypto.randomUUID(), expectedRevision: state.revision, actor: { id: actors[role], role } });
  const run = (operation: (value: ArrivalQueueState) => ArrivalQueueState, success: string) => {
    try {
      setState(repository.commit(state.revision, operation));
      setMessage(success);
      setFeedbackTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Arrival queue action failed.');
      setFeedbackTone('error');
    }
    queueMicrotask(() => feedback.current?.focus());
  };
  const selected = state.reservations.find((item) => state.selectedIds.includes(item.id));
  const matchingRoom = state.rooms.find((room) => room.roomType === selected?.roomType && room.occupancy === 'available');
  const stage = selected ? selected.status === 'checked-in' ? 4 : selected.roomId ? 3 : selected.identityStatus === 'verified' ? 2 : selected.owner ? 1 : 0 : 0;

  return <main className="page">
    <header className="page-title">
      <p>Front office operations</p>
      <h1>Arrival queue</h1>
      <p>Filter arrivals, preserve selection across fresh room data and coordinate identity, ownership, assignment and check-in.</p>
    </header>
    <section className="workspace-toolbar">
      <label>Arrival role
        <select value={role} onChange={(event) => { setRole(event.target.value as ArrivalRole); }}>
          {Object.keys(actors).map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label>Arrival filter
        <select value={state.filter} onChange={(event) => {
          const filter = event.target.value as ArrivalFilter;
          run((value) => changeArrivalFilter(value, { ...meta(), filter }), `Arrival filter changed to ${filter}.`);
        }}>
          <option value="all">All arrivals</option>
          <option value="due-now">Due now</option>
          <option value="needs-room">Needs room</option>
        </select>
      </label>
      <button disabled={role !== 'Housekeeping Coordinator'} onClick={() => {
        const capturedQueueVersion = state.queueVersion;
        run((value) => applyRoomInventoryRefresh(value, { ...meta(), responseVersion: 5, capturedQueueVersion, readyRoomIds: ['ROOM-302'] }), 'Room inventory refreshed without losing visible selection.');
      }}>Refresh room inventory</button>
    </section>
    {message && <p ref={feedback} tabIndex={-1} role={feedbackTone === 'error' ? 'alert' : 'status'} className={`workflow-feedback ${feedbackTone}`}>{message}</p>}
    <div className="workflow-master-detail">
    <section className="suite-table-wrap workflow-queue" aria-label="Arrival results">
      <table>
        <caption>{visibleArrivals(state).length} visible arrivals · {state.selectedIds.length} selected</caption>
        <thead><tr><th>Select</th><th>Guest</th><th>Arrival</th><th>Status</th><th>Room</th></tr></thead>
        <tbody>{visibleArrivals(state).map((reservation) => <tr key={reservation.id}>
          <td><input type="checkbox" aria-label={`Select ${reservation.id}`} checked={state.selectedIds.includes(reservation.id)} onChange={() => {
            run((value) => toggleArrivalSelection(value, { ...meta(), reservationId: reservation.id }), `${reservation.id} selection updated.`);
          }} /></td>
          <td>{reservation.guestName}<small>{reservation.id}</small></td>
          <td>{reservation.arrivalDate}</td>
          <td>{reservation.status} · {reservation.identityStatus}</td>
          <td>{reservation.roomId ?? 'unassigned'}</td>
        </tr>)}</tbody>
      </table>
    </section>
    <aside className="card workflow-detail" aria-label="Selected arrival actions">
      <h2>{selected ? `${selected.id} · ${selected.status}` : 'Select one arrival'}</h2>
      {selected && <>
        <p>Owner {selected.owner ?? 'unclaimed'} · identity {selected.identityStatus} · room {selected.roomId ?? 'unassigned'}</p>
        <p>Requested {selected.roomType} · inventory feed {state.inventoryFeedVersion}</p>
      </>}
      <ol className="workflow-steps" aria-label="Arrival stages">{['Claim arrival', 'Verify identity', 'Assign room', 'Check in'].map((label, index) => <li key={label} data-complete={stage > index} aria-current={stage === index ? 'step' : undefined}>{label}</li>)}</ol>
      <div className="workflow-actions">
      <button disabled={role !== 'Front Desk' || !selected || Boolean(selected.owner)} onClick={() => {
        if (selected) run((value) => claimSelectedArrival(value, { ...meta(), expectedReservationVersion: selected.version }), 'Arrival ownership claimed.');
      }}>Claim selected arrival</button>
      <button disabled={role !== 'Front Desk' || selected?.owner !== actors['Front Desk'] || selected.identityStatus !== 'pending'} onClick={() => {
        run((value) => verifySelectedArrivalIdentity(value, { ...meta(), documentReference: 'PASSPORT-301' }), 'Selected arrival identity verified.');
      }}>Verify selected identity</button>
      <button disabled={role !== 'Duty Manager' || selected?.identityStatus !== 'verified' || Boolean(selected.roomId) || matchingRoom?.readiness !== 'clean'} onClick={() => {
        if (matchingRoom) run((value) => assignSelectedReadyRoom(value, { ...meta(), roomId: matchingRoom.id, expectedRoomVersion: matchingRoom.version }), 'Ready room assigned to selected arrival.');
      }}>Assign selected room</button>
      <button disabled={role !== 'Front Desk' || !selected?.roomId || selected.status !== 'expected'} onClick={() => {
        run((value) => checkInSelectedArrival(value, meta()), 'Selected arrival checked in.');
      }}>Check in selected arrival</button>
      </div>
    </aside>
    </div>
    <section className="card workflow-history" aria-label="Arrival history">
      <details><summary>Arrival history · {state.events.length} events</summary>
      {state.events.map((event) => <p key={event.id}>{event.action}{event.reservationId ? ` · ${event.reservationId}` : ''}</p>)}
      </details>
    </section>
  </main>;
}
