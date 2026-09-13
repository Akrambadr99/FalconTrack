import { describe, expect, it } from 'vitest';
import { authorizeArrivalDeposit, checkInGuest, completeCheckout, initialStayDossierState, openStayDossier, requestCheckout, settleStayFolio, verifyRoomReadiness } from './stay-dossier';
const meta = (id: string, revision: number, actor: string, role: 'Front Desk' | 'Housekeeping' | 'Duty Manager' | 'Finance') => ({ id, expectedRevision: revision, actor: { id: actor, role } });

describe('integrated stay dossier', () => {
  it('coordinates ready room arrival folio settlement and checkout', () => {
    let state = openStayDossier(initialStayDossierState, meta('open', 0, 'front', 'Front Desk'));
    state = verifyRoomReadiness(state, { ...meta('ready', 1, 'housekeeping', 'Housekeeping'), evidence: 'Room inspection confirms clean inventory and all guest amenities.' });
    state = authorizeArrivalDeposit(state, { ...meta('deposit', 2, 'manager', 'Duty Manager'), amount: 20_000 });
    state = checkInGuest(state, meta('checkin', 3, 'front', 'Front Desk'));
    state = requestCheckout(state, meta('request', 4, 'front', 'Front Desk'));
    state = settleStayFolio(state, { ...meta('settle', 5, 'finance', 'Finance'), payment: 40_000 });
    state = completeCheckout(state, meta('checkout', 6, 'front', 'Front Desk'));
    expect(state.reservation.status).toBe('checked-out');
    expect(state.room.status).toBe('dirty');
    expect(state.folio).toMatchObject({ status: 'settled', payments: 40_000 });
    expect(state.events).toHaveLength(7);
  });

  it('blocks check-in after a room version conflict', () => {
    let state = openStayDossier(initialStayDossierState, meta('open', 0, 'front', 'Front Desk'));
    state = verifyRoomReadiness(state, { ...meta('ready', 1, 'housekeeping', 'Housekeeping'), evidence: 'Room inspection confirms clean inventory and all guest amenities.' });
    state = authorizeArrivalDeposit(state, { ...meta('deposit', 2, 'manager', 'Duty Manager'), amount: 20_000 });
    state.room.version += 1;
    expect(() => checkInGuest(state, meta('checkin', 3, 'front', 'Front Desk'))).toThrow('Room state changed');
    expect(state.reservation.status).toBe('confirmed');
  });
});
