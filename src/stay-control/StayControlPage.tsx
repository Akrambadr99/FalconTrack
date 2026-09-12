import { useRef, useState } from 'react';
import { approveArrivalRecovery, decideAmendment, inspectCleanTask, openArrivalRecovery, requestAmendment, resolveArrivalRecovery, startCleanTask, submitCleanTask, StayControlRepository, type StayControlState, type StayRole } from './stay-control';

const actors: Record<StayRole, string> = { 'Duty Manager': 'manager', 'Front Desk': 'front', 'Housekeeping Lead': 'house', Auditor: 'audit' };

export function StayControlPage() {
  const [repository] = useState(() => new StayControlRepository(localStorage));
  const [state, setState] = useState<StayControlState>(() => repository.read());
  const [role, setRole] = useState<StayRole>('Front Desk');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  const amendment = state.amendments.at(-1), recovery = state.recoveries.at(-1), task = state.cleanTasks.at(-1);
  const meta = () => ({ id: crypto.randomUUID(), expectedRevision: state.revision, actor: { id: actors[role], role }, at: '2026-09-13T10:00:00Z' });
  const run = (change: (value: StayControlState) => StayControlState, message: string) => {
    try { const next = repository.commit(state.revision, change); setState(next); setNotice(message); setError(''); queueMicrotask(() => { feedback.current?.focus(); }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Stay action failed.'); setNotice(''); queueMicrotask(() => { feedback.current?.focus(); }); }
  };
  return <main className="page">
    <header className="page-title"><p>Hotel-specific execution</p><h1>Stay amendment, arrival recovery and room readiness</h1><p>Coordinate guest commitments, available inventory and independently inspected housekeeping.</p></header>
    <section className="workspace-toolbar" aria-label="Stay actor"><label>Hotel role<select value={role} onChange={event => { setRole(event.target.value as StayRole); }}>{Object.keys(actors).map(value => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setState(repository.read()); }}>Refresh stay control</button></section>
    {(notice || error) && <p ref={feedback} tabIndex={-1} role={error ? 'alert' : 'status'}>{error || notice}</p>}
    <div className="cards">
      <section className="card"><h2>Stay amendment</h2><p>{amendment?.status ?? 'none'} · departure {state.stays[0]?.departure}</p><button type="button" disabled={role !== 'Front Desk' || Boolean(amendment)} onClick={() => { run(current => requestAmendment(current, { ...meta(), stayId: 'stay-a', departure: '2026-09-17', reason: 'Guest extended the visit after airline disruption.' }), 'Amendment requested.'); }}>Request stay extension</button><button type="button" disabled={role !== 'Duty Manager' || amendment?.status !== 'requested'} onClick={() => { run(current => decideAmendment(current, { ...meta(), amendmentId: amendment?.id ?? '', approve: true, rationale: 'Inventory and the guest guarantee were independently reviewed.' }), 'Amendment approved.'); }}>Approve stay extension</button></section>
      <section className="card"><h2>Arrival recovery</h2><p>{recovery?.status ?? 'none'} · room {state.stays[1]?.roomId ?? 'unassigned'}</p><button type="button" disabled={role !== 'Front Desk' || Boolean(recovery)} onClick={() => { run(current => openArrivalRecovery(current, { ...meta(), stayId: 'stay-b', rationale: 'Assigned inventory was withdrawn immediately before arrival.' }), 'Arrival recovery opened.'); }}>Open arrival recovery</button><button type="button" disabled={role !== 'Duty Manager' || recovery?.status !== 'open'} onClick={() => { run(current => approveArrivalRecovery(current, { ...meta(), recoveryId: recovery?.id ?? '', roomId: 'room-205', rationale: 'Alternative inventory and dates were independently verified.' }), 'Alternative room approved.'); }}>Approve alternative room</button><button type="button" disabled={role !== 'Front Desk' || recovery?.status !== 'approved'} onClick={() => { run(current => resolveArrivalRecovery(current, { ...meta(), recoveryId: recovery?.id ?? '' }), 'Arrival recovered.'); }}>Complete room assignment</button></section>
      <section className="card"><h2>Housekeeping inspection</h2><p>{task?.status ?? 'none'} · attempts {task?.attempts ?? 0} · room {state.rooms[2]?.status}</p><button type="button" disabled={role !== 'Housekeeping Lead' || Boolean(task)} onClick={() => { run(current => startCleanTask(current, { ...meta(), roomId: 'room-206' }), 'Cleaning started.'); }}>Start room clean</button><button type="button" disabled={role !== 'Housekeeping Lead' || task?.status !== 'in-progress'} onClick={() => { run(current => submitCleanTask(current, { ...meta(), taskId: task?.id ?? '', note: 'Room surfaces and linen were fully cleaned and replaced.' }), 'Room submitted for inspection.'); }}>Submit room ready</button><button type="button" disabled={role !== 'Duty Manager' || task?.status !== 'ready-for-inspection'} onClick={() => { run(current => inspectCleanTask(current, { ...meta(), taskId: task?.id ?? '', pass: true, note: 'Room inspection passed every readiness and safety checkpoint.' }), 'Room passed inspection.'); }}>Pass room inspection</button></section>
    </div>
    <section aria-label="Stay control history"><h2>Stay control history</h2><ol>{state.events.toReversed().map(event => <li key={event.id}>{event.action} · {event.actor} · {event.detail}</li>)}</ol></section>
  </main>;
}
