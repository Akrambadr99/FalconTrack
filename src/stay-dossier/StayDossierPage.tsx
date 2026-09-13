import { useRef, useState } from 'react';
import { authorizeArrivalDeposit, checkInGuest, completeCheckout, openStayDossier, requestCheckout, settleStayFolio, StayDossierRepository, verifyRoomReadiness, type StayDossierRole, type StayDossierState } from './stay-dossier';
const actorIds: Record<StayDossierRole, string> = { 'Front Desk': 'front', Housekeeping: 'housekeeping', 'Duty Manager': 'manager', Finance: 'finance' };

export function StayDossierPage() {
  const [repository] = useState(() => new StayDossierRepository(localStorage));
  const [state, setState] = useState<StayDossierState>(() => repository.read());
  const [role, setRole] = useState<StayDossierRole>('Front Desk');
  const [message, setMessage] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  const command = () => ({ id: crypto.randomUUID(), expectedRevision: state.revision, actor: { id: actorIds[role], role } });
  const run = (change: (value: StayDossierState) => StayDossierState, success: string) => {
    try { setState(repository.commit(state.revision, change)); setMessage(success); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Stay action failed.'); }
    queueMicrotask(() => feedback.current?.focus());
  };
  return <main className="page">
    <header className="page-title"><p>Stay lifecycle assurance</p><h1>Integrated stay dossier</h1><p>Reservation, room readiness, maintenance, deposit, occupancy, folio and checkout remain versioned together.</p></header>
    <section className="workspace-toolbar"><label>Stay dossier role<select value={role} onChange={(event) => { setRole(event.target.value as StayDossierRole); }}>{Object.keys(actorIds).map((item) => <option key={item}>{item}</option>)}</select></label><button onClick={() => { setState(repository.read()); }}>Refresh stay dossier</button></section>
    {message && <p ref={feedback} tabIndex={-1} role="status">{message}</p>}
    <div className="cards">
      <section className="card"><h2>{state.reservation.guest}</h2><p>{state.reservation.status} · room {state.room.status} · dossier {state.dossier?.status ?? 'none'}</p><p>Maintenance {state.maintenance.status} · inspection {state.room.inspectionVersion}</p>
        <button disabled={role !== 'Front Desk' || Boolean(state.dossier)} onClick={() => { run((value) => openStayDossier(value, command()), 'Stay dossier opened.'); }}>Open arrival dossier</button>
        <button disabled={role !== 'Housekeeping' || state.dossier?.status !== 'opened'} onClick={() => { run((value) => verifyRoomReadiness(value, { ...command(), evidence: 'Room inspection confirms clean inventory and all guest amenities.' }), 'Room readiness verified.'); }}>Verify room readiness</button>
        <button disabled={role !== 'Duty Manager' || state.dossier?.status !== 'ready'} onClick={() => { run((value) => authorizeArrivalDeposit(value, { ...command(), amount: 20_000 }), 'Arrival deposit authorized.'); }}>Authorize arrival deposit</button>
        <button disabled={role !== 'Front Desk' || state.dossier?.status !== 'authorized'} onClick={() => { run((value) => checkInGuest(value, command()), 'Guest checked in.'); }}>Check in authorized guest</button>
      </section>
      <section className="card"><h2>Folio and checkout</h2><p>{state.folio.status} · charges {state.folio.charges} · payments {state.folio.payments}</p>
        <button disabled={role !== 'Front Desk' || state.dossier?.status !== 'in-house'} onClick={() => { run((value) => requestCheckout(value, command()), 'Checkout requested.'); }}>Request guest checkout</button>
        <button disabled={role !== 'Finance' || state.dossier?.status !== 'checkout-pending'} onClick={() => { run((value) => settleStayFolio(value, { ...command(), payment: 40_000 }), 'Stay folio settled.'); }}>Settle stay folio</button>
        <button disabled={role !== 'Front Desk' || state.dossier?.status !== 'settled'} onClick={() => { run((value) => completeCheckout(value, command()), 'Guest checked out and room queued.'); }}>Complete guest checkout</button>
      </section>
    </div>
    <section aria-label="Stay dossier history"><h2>Stay dossier history</h2><ol>{state.events.toReversed().map((event) => <li key={event.id}>{event.action} · {event.actor} · {event.detail}</li>)}</ol></section>
  </main>;
}
