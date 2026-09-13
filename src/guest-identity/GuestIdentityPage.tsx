import { useRef, useState } from 'react';
import { confirmDuplicateProfile, grantGuestConsent, GuestIdentityRepository, mergeGuestProfiles, openIdentityReview, revokeMarketingConsent, verifyGuestIdentity, type GuestIdentityState, type IdentityRole } from './guest-identity';

const actors: Record<IdentityRole, string> = { 'Front Desk': 'front-desk', 'Privacy Officer': 'privacy', 'Duty Manager': 'manager', Guest: 'GUEST-PRIMARY' };

export function GuestIdentityPage() {
  const [repository] = useState(() => new GuestIdentityRepository(localStorage));
  const [state, setState] = useState<GuestIdentityState>(() => repository.read());
  const [role, setRole] = useState<IdentityRole>('Front Desk');
  const [message, setMessage] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  const meta = () => ({ id: crypto.randomUUID(), expectedRevision: state.revision, actor: { id: actors[role], role } });
  const run = (operation: (value: GuestIdentityState) => GuestIdentityState, success: string) => {
    try { setState(repository.commit(state.revision, operation)); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Guest identity action failed.'); }
    queueMicrotask(() => feedback.current?.focus());
  };
  const main = state.profiles.find((profile) => profile.id === state.reservation.guestId);
  const duplicate = state.profiles.find((profile) => profile.id === 'GUEST-DUPLICATE');
  return <main className="page">
    <header className="page-title"><p>Guest identity</p><h1>Identity and consent</h1><p>Resolve duplicate profiles, preserve consent evidence and release the held reservation.</p></header>
    <section className="workspace-toolbar"><label>Identity role<select value={role} onChange={(event) => { setRole(event.target.value as IdentityRole); }}>{Object.keys(actors).map((item) => <option key={item}>{item}</option>)}</select></label><button onClick={() => { setState(repository.read()); setMessage('Guest identity refreshed.'); }}>Refresh guest identity</button></section>
    {message && <p ref={feedback} tabIndex={-1} role="status">{message}</p>}
    <section className="card">
      <h2>{state.reservation.id} · {state.review?.status ?? 'not reviewed'}</h2>
      <p>Reservation {state.reservation.status} · primary {main?.status} · duplicate {duplicate?.status}</p>
      <p>Loyalty {main?.loyaltyPoints ?? 0} · stays {main?.completedStays ?? 0} · evidence {state.history.length}</p>
      <p>Stay consent {state.consent.stayProcessing ? 'granted' : 'missing'} · marketing {state.consent.marketing ? 'granted' : 'revoked'}</p>
      <button disabled={role !== 'Front Desk' || Boolean(state.review)} onClick={() => { run((value) => openIdentityReview(value, { ...meta(), documentHash: 'a18b29c30d4e5f607182' }), 'Identity review opened.'); }}>Open identity review</button>
      <button disabled={role !== 'Privacy Officer' || state.review?.status !== 'opened'} onClick={() => { run((value) => confirmDuplicateProfile(value, meta()), 'Duplicate profile confirmed.'); }}>Confirm duplicate profile</button>
      <button disabled={role !== 'Duty Manager' || state.review?.status !== 'duplicate-confirmed'} onClick={() => { run((value) => mergeGuestProfiles(value, meta()), 'Guest profiles merged.'); }}>Merge guest profiles</button>
      <button disabled={role !== 'Guest' || state.review?.status !== 'merged'} onClick={() => { run((value) => grantGuestConsent(value, { ...meta(), stayProcessing: true, marketing: true }), 'Guest consent granted.'); }}>Grant guest consent</button>
      <button disabled={role !== 'Front Desk' || state.review?.status !== 'consented'} onClick={() => { run((value) => verifyGuestIdentity(value, meta()), 'Guest identity verified.'); }}>Verify guest identity</button>
      <button disabled={role !== 'Guest' || state.review?.status !== 'verified' || !state.consent.marketing} onClick={() => { run((value) => revokeMarketingConsent(value, meta()), 'Marketing consent revoked.'); }}>Revoke marketing consent</button>
    </section>
    <section className="card" aria-label="Guest identity history"><h2>Identity history</h2>{state.history.map((entry) => <p key={entry.id}>{entry.kind} · {entry.detail}</p>)}</section>
  </main>;
}
