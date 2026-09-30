import { prepareDepartureOperation } from './folio-adjustments';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../application/AppProviders';
import { WorkspacePage } from '../features/workspace/WorkspacePage';
import { Repository } from '../workspace/repository';
import { product } from '../product/definition';
import { execute, fresh } from '../workspace/engine';
import type { Snapshot, Value } from '../workspace/types';
const note = 'Guest service recovery credit reviewed against the reservation.';
function act(state: Snapshot, operation: string, entityId: string, actorId: string, input: Record<string, Value> = {}) {
    return execute(state, { id: 'c-' + String(state.revision), expectedRevision: state.revision, actorId, type: 'operate', operation, entityId, input }, product, '2026-09-13T12:00:00Z');
}
function checkedIn() { return act(fresh(product), 'checkin', 'stay-1', 'actor-1'); }
function request(state = checkedIn(), direction = 'credit') { return act(state, 'adjustment-request', 'c-0-1', 'actor-1', { amount: 5000, direction, reference: 'SERVICE-001', note }); }
describe('governed guest folio adjustments', () => {
    it('applies an approved credit and permits settlement and checkout', () => {
        let state = act(request(), 'adjustment-approve', 'c-1-1', 'actor-0', { note });
        expect(state.entities.find(item => item.id === 'c-0-1')?.fields['charges']).toBe(40000);
        state = act(state, 'payment', 'c-0-1', 'actor-1', { amount: 40000 });
        expect(act(state, 'checkout', 'stay-1', 'actor-1').entities.find(item => item.id === 'stay-1')?.status).toBe('checked-out');
    });
    it('blocks checkout while an adjustment is pending', () => {
        expect(() => act(request(), 'checkout', 'stay-1', 'actor-1')).toThrow(/pending folio adjustments/);
    });
    it('requires a fresh request after another payment changes the folio', () => {
        const state = act(request(), 'payment', 'c-0-1', 'actor-1', { amount: 1000 });
        expect(() => act(state, 'adjustment-approve', 'c-1-1', 'actor-0', { note })).toThrow(/Folio changed/);
        expect(act(state, 'adjustment-cancel', 'c-1-1', 'actor-1', { note }).entities.find(item => item.id === 'c-1-1')?.status).toBe('cancelled');
    });
    it('does not approve a credit below payments or permit desk self-approval', () => {
        const paid = act(checkedIn(), 'payment', 'c-0-1', 'actor-1', { amount: 45000 });
        const state = request(paid);
        expect(() => act(state, 'adjustment-approve', 'c-2-1', 'actor-0', { note })).toThrow(/below collected payments/);
        expect(() => act(state, 'adjustment-approve', 'c-2-1', 'actor-1', { note })).toThrow(/role/);
    });
    it('reopens an in-house settled folio when an approved debit adds charges', () => {
        const paid = act(checkedIn(), 'payment', 'c-0-1', 'actor-1', { amount: 45000 });
        const state = act(request(paid, 'debit'), 'adjustment-approve', 'c-2-1', 'actor-0', { note });
        expect(state.entities.find(item => item.id === 'c-0-1')).toMatchObject({ status: 'open', fields: { charges: 50000, payments: 45000 } });
    });
});

const departureInput = { departure: '2026-09-14', reference: 'GUEST-EARLY-001', reason: 'Guest confirmed earlier departure after a revised flight booking.' };
function earlyRequest(state = checkedIn()) { return act(state, 'departure-request', 'stay-1', 'actor-1', departureInput); }
function earlyRequestId(state: Snapshot) { const request = state.entities.find((item) => item.kind === 'departure-amendment' && item.status === 'requested'); if (!request) throw new Error('Departure request missing.'); return request.id; }
describe('authoritative in-house early-departure reviews', () => {
    beforeAll(() => prepareDepartureOperation('departure-request'));
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
    it('independently credits unused booked nights and releases dates without premature housekeeping', () => {
        const requested = earlyRequest(), before = structuredClone(requested), requestId = earlyRequestId(requested);
        expect(requested.entities.find((item) => item.id === 'stay-1')?.fields['departure']).toBe('2026-09-15');
        const approved = act(requested, 'departure-approve', requestId, 'actor-0', { reason: departureInput.reason });
        expect(approved.entities.find((item) => item.id === 'stay-1')).toMatchObject({ status: 'checked-in', fields: { departure: '2026-09-14' } });
        expect(approved.entities.find((item) => item.id === 'c-0-1')).toMatchObject({ status: 'open', fields: { charges: 30000, payments: 0, bookedRate: 15000, bookedDeparture: '2026-09-15' } });
        expect(approved.entities.find((item) => item.id === 'room-1')?.status).toBe('occupied');
        expect(approved.entities.filter((item) => item.kind === 'task')).toEqual(before.entities.filter((item) => item.kind === 'task'));
        expect(approved.entities.find((item) => item.id === requestId)).toMatchObject({ status: 'approved', fields: { credit: 15000, requester: 'actor-1', decisionActor: 'actor-0', reference: departureInput.reference } });
        expect(requested).toEqual(before);
        const reserveNext = (source: Snapshot) => execute(source, { id: 'next-calendar-guest', expectedRevision: source.revision, actorId: 'actor-1', type: 'create', kind: 'stay', title: 'Next guest after revised departure', input: { room: 'room-1', arrival: '2026-09-14', departure: '2026-09-16', guest: 'Next guest' } }, product, '2026-09-13T12:00:00Z');
        expect(() => reserveNext(requested)).toThrow('already reserved');
        expect(reserveNext(approved).entities.find((item) => item.id === 'next-calendar-guest')?.status).toBe('reserved');
        expect(() => act(approved, 'departure-approve', requestId, 'actor-0', { reason: departureInput.reason })).toThrow('current state');
        const paid = act(approved, 'payment', 'c-0-1', 'actor-1', { amount: 30000 });
        const checkedOut = act(paid, 'checkout', 'stay-1', 'actor-1');
        expect(checkedOut.entities.find((item) => item.id === 'room-1')?.status).toBe('dirty');
        expect(checkedOut.entities.filter((item) => item.kind === 'task')).toHaveLength(before.entities.filter((item) => item.kind === 'task').length + 1);
    });
    it('preserves the original booking price after a room move and handles extension-rate history', () => {
        let moved = act(checkedIn(), 'plan-move', 'stay-1', 'actor-1', { target: 'room-2', reason: 'Guest requested a quieter assigned room.' });
        const move = moved.entities.find((item) => item.kind === 'move'); if (!move) throw new Error('Move missing.');
        moved = act(moved, 'execute-move', move.id, 'actor-1');
        expect(moved.entities.find((item) => item.id === 'room-2')?.fields['rate']).not.toBe(15000);
        let requested = earlyRequest(moved);
        expect(requested.entities.find((item) => item.id === earlyRequestId(requested))?.fields['credit']).toBe(15000);
        let current = act(requested, 'departure-approve', earlyRequestId(requested), 'actor-0', { reason: departureInput.reason });
        current = act(current, 'extend-stay', 'stay-1', 'actor-1', { departure: '2026-09-16', reason: 'Guest rebooked two additional occupied nights.' });
        requested = act(current, 'departure-request', 'stay-1', 'actor-1', { ...departureInput, reference: 'GUEST-EARLY-002', departure: '2026-09-15' });
        expect(requested.entities.find((item) => item.id === earlyRequestId(requested))?.fields['credit']).toBe(current.entities.find((item) => item.id === 'room-2')?.fields['rate']);
        const final = act(requested, 'departure-approve', earlyRequestId(requested), 'actor-0', { reason: departureInput.reason });
        expect(final.entities.find((item) => item.id === 'c-0-1')?.fields['charges']).toBe(30000 + Number(current.entities.find((item) => item.id === 'room-2')?.fields['rate']));
    });
    it('blocks stale financial review and preserves the request for explicit cancellation', () => {
        const requested = earlyRequest(), requestId = earlyRequestId(requested);
        const changed = act(requested, 'payment', 'c-0-1', 'actor-1', { amount: 1000 }), before = structuredClone(changed);
        expect(() => act(changed, 'departure-approve', requestId, 'actor-0', { reason: departureInput.reason })).toThrow('Departure sources changed');
        expect(changed).toEqual(before);
        const cancelled = act(changed, 'departure-cancel', requestId, 'actor-1', { reason: 'Cancel stale request before fresh financial review.' });
        expect(cancelled.entities.find((item) => item.id === requestId)?.status).toBe('cancelled');
        expect(earlyRequest(cancelled).entities.filter((item) => item.kind === 'departure-amendment')).toHaveLength(2);
    });
    it('does not hide refunds or allow checkout to skip an unresolved departure decision', () => {
        const paid = act(checkedIn(), 'payment', 'c-0-1', 'actor-1', { amount: 45000 }), requested = earlyRequest(paid), before = structuredClone(requested);
        expect(() => act(requested, 'departure-approve', earlyRequestId(requested), 'actor-0', { reason: departureInput.reason })).toThrow('authorized refund');
        expect(() => act(requested, 'checkout', 'stay-1', 'actor-1')).toThrow('pending early-departure');
        expect(() => act(requested, 'extend-stay', 'stay-1', 'actor-1', { departure: '2026-09-16', reason: departureInput.reason })).toThrow('pending early-departure');
        expect(requested).toEqual(before);
        const rejected = act(requested, 'departure-reject', earlyRequestId(requested), 'actor-0', { reason: 'Guest retains the fully paid booking instead of an unapproved refund.' });
        expect(rejected.entities.find((item) => item.id === 'c-0-1')?.fields['charges']).toBe(45000);
        expect(act(rejected, 'checkout', 'stay-1', 'actor-1').entities.find((item) => item.id === 'stay-1')?.status).toBe('checked-out');
    });
    it('keeps old browser snapshots loadable without inventing missing booking prices', () => {
        const legacy = checkedIn(), folio = legacy.entities.find((item) => item.id === 'c-0-1'); if (!folio) throw new Error('Folio missing.');
        delete folio.fields['bookedRate']; delete folio.fields['bookedArrival']; delete folio.fields['bookedDeparture'];
        let raw = JSON.stringify(legacy); const repository = new Repository(product, { getItem: () => raw, setItem: (_key, value) => { raw = value; } });
        expect(repository.read()).toEqual(legacy);
        expect(() => earlyRequest(repository.read())).toThrow('pricing is missing');
        expect(JSON.parse(raw)).toEqual(legacy);
    });
    it('rejects invalid dates and unauthorized approval without partial source mutation', () => {
        const source = checkedIn();
        for (const departure of ['2026-09-12', '2026-09-15', '2026-02-30']) expect(() => act(source, 'departure-request', 'stay-1', 'actor-1', { ...departureInput, departure })).toThrow();
        const requested = earlyRequest(source);
        expect(() => act(requested, 'departure-approve', earlyRequestId(requested), 'actor-1', { reason: departureInput.reason })).toThrow('role');
        const dualRoleProduct = { ...product, actors: product.actors.map((actor) => actor.id === 'actor-1' ? { ...actor, role: 'Duty Manager' } : actor) };
        expect(() => execute(requested, { id: 'self-review', expectedRevision: requested.revision, actorId: 'actor-1', type: 'operate', operation: 'departure-approve', entityId: earlyRequestId(requested), input: { reason: departureInput.reason } }, dualRoleProduct, '2026-09-13T12:00:00Z')).toThrow('independent duty manager');
        expect(source).toEqual(checkedIn());
    });
    it('fails command loading without writes and permits the same request after retry', async () => {
        const baseline = checkedIn(); let raw = JSON.stringify(baseline), failLoading = true, writes = 0;
        const source = { ...product, prepareOperation: async (key: string) => { if (failLoading) throw new Error('Departure loader unavailable'); await prepareDepartureOperation(key); } };
        const repository = new Repository(source, { getItem: () => raw, setItem: (_key, value) => { raw = value; writes += 1; } });
        const command = { id: 'lazy-departure', expectedRevision: baseline.revision, actorId: 'actor-1', type: 'operate' as const, operation: 'departure-request', entityId: 'stay-1', input: departureInput };
        await expect(repository.commitCoordinated(command, '2026-09-13T12:00:00Z')).rejects.toThrow('loader unavailable');
        expect(repository.read()).toEqual(baseline); expect(writes).toBe(0);
        failLoading = false; const next = await repository.commitCoordinated(command, '2026-09-13T12:00:00Z');
        expect(next.entities.find((item) => item.kind === 'departure-amendment')?.fields['credit']).toBe(15000); expect(writes).toBe(1);
    });
    it('rechecks the current workspace after asynchronous command preparation', async () => {
        const baseline = checkedIn(); let raw = JSON.stringify(baseline), writes = 0;
        const changed = act(baseline, 'payment', 'c-0-1', 'actor-1', { amount: 1000 });
        const source = { ...product, prepareOperation: async (key: string) => { raw = JSON.stringify(changed); await prepareDepartureOperation(key); } };
        const repository = new Repository(source, { getItem: () => raw, setItem: (_key, value) => { raw = value; writes += 1; } });
        await expect(repository.commitCoordinated({ id: 'stale-loading', expectedRevision: baseline.revision, actorId: 'actor-1', type: 'operate', operation: 'departure-request', entityId: 'stay-1', input: departureInput }, '2026-09-13T12:00:00Z')).rejects.toThrow('workspace changed');
        expect(repository.read()).toEqual(changed); expect(writes).toBe(0);
    });
    it('retains the financial failure form and selected review instead of losing operator context', async () => {
        cleanup(); localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-13T12:00:00Z')); const user = userEvent.setup(); const paid = act(checkedIn(), 'payment', 'c-0-1', 'actor-1', { amount: 45000 }), requested = earlyRequest(paid);
        localStorage.setItem('staypilot:workspace:v1', JSON.stringify(requested));
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
        render(createElement(AppProviders, null, createElement(WorkspacePage)));
        await user.click(screen.getByRole('button', { name: /^Early departure reviews/ }));
        await user.click(screen.getByRole('button', { name: 'Approve early departure and credit' }));
        await user.type(screen.getByLabelText('Early departure rationale'), 'Independent check confirms the refund still requires separate authority.');
        await user.click(screen.getByRole('button', { name: 'Save command' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('authorized refund');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByLabelText('Early departure rationale')).toHaveValue('Independent check confirms the refund still requires separate authority.');
        expect(new Repository(product, localStorage).read()).toEqual(requested);
        cleanup(); localStorage.clear();
    });
    it('restores a validated departure draft but requires source refresh after another financial write', async () => {
        cleanup(); localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-13T12:00:00Z')); const user = userEvent.setup();
        const baseline = checkedIn(), changed = act(baseline, 'payment', 'c-0-1', 'actor-1', { amount: 1000 });
        localStorage.setItem('staypilot:workspace:v1', JSON.stringify(changed));
        localStorage.setItem('staypilot:departure-command-recovery:v1', JSON.stringify({ operation: 'departure-request', target: 'stay-1', actor: 'actor-1', revision: baseline.revision, values: departureInput }));
        render(createElement(AppProviders, null, createElement(WorkspacePage)));
        expect(screen.getByRole('dialog')).toHaveTextContent('Request early departure review');
        expect(screen.getByRole('alert')).toHaveTextContent('sources changed during reload');
        expect(screen.getByLabelText('Guest departure evidence')).toHaveValue(departureInput.reference);
        await user.click(screen.getByRole('button', { name: 'Save command' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('workspace changed'); expect(new Repository(product, localStorage).read()).toEqual(changed);
        await user.click(screen.getByRole('button', { name: 'Refresh records and retain input' }));
        expect(screen.getByLabelText('Early departure rationale')).toHaveValue(departureInput.reason);
        await user.click(screen.getByRole('button', { name: 'Save command' }));
        await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(new Repository(product, localStorage).read().entities.filter((item) => item.kind === 'departure-amendment')).toHaveLength(1);
        expect(localStorage.getItem('staypilot:departure-command-recovery:v1')).toBeNull();
        cleanup(); localStorage.clear();
    });
    it('ignores malformed or unrelated recovery drafts without opening a command or mutating records', () => {
        cleanup(); localStorage.clear(); const baseline = checkedIn(); localStorage.setItem('staypilot:workspace:v1', JSON.stringify(baseline));
        for (const draft of [null, [], { operation: 'payment', target: 'c-0-1', actor: 'actor-1', revision: 1, values: { amount: 1000 } }, { operation: 'departure-request', target: 'missing-stay', actor: 'actor-1', revision: 1, values: departureInput }, { operation: 'departure-request', target: 'stay-1', actor: 'actor-1', revision: 1, values: [] }]) {
            localStorage.setItem('staypilot:departure-command-recovery:v1', JSON.stringify(draft));
            render(createElement(AppProviders, null, createElement(WorkspacePage)));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(new Repository(product, localStorage).read()).toEqual(baseline); cleanup();
        }
        localStorage.clear();
    });
    it('keeps the failed load form when durable recovery draft storage is unavailable', async () => {
        cleanup(); localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-13T12:00:00Z')); const user = userEvent.setup(), baseline = checkedIn();
        localStorage.setItem('staypilot:workspace:v1', JSON.stringify(baseline));
        vi.spyOn(Repository.prototype, 'commitCoordinated').mockRejectedValueOnce(new Error('Departure failed to load.', { cause: 'departure-load' }));
        render(createElement(AppProviders, null, createElement(WorkspacePage)));
        await user.selectOptions(screen.getByLabelText('Current actor'), 'actor-1'); await user.click(screen.getByRole('button', { name: /^Guest reservations/ }));
        await user.click(screen.getByRole('button', { name: 'Request early departure review' }));
        await user.type(screen.getByLabelText('Earlier departure date'), departureInput.departure);
        await user.type(screen.getByLabelText('Guest departure evidence'), departureInput.reference); await user.type(screen.getByLabelText('Early departure rationale'), departureInput.reason);
        await user.click(screen.getByRole('button', { name: 'Save command' })); expect(await screen.findByRole('alert')).toHaveTextContent('Departure failed to load');
        const setItem = Storage.prototype.setItem.bind(localStorage);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) { if (key === 'staypilot:departure-command-recovery:v1') throw new Error('Storage full'); setItem(key, value); });
        await user.click(screen.getByRole('button', { name: 'Reload departure workflow and retain input' }));
        expect(screen.getByRole('alert')).toHaveTextContent('draft could not be saved'); expect(screen.getByLabelText('Guest departure evidence')).toHaveValue(departureInput.reference);
        expect(new Repository(product, localStorage).read()).toEqual(baseline); expect(localStorage.getItem('staypilot:departure-command-recovery:v1')).toBeNull();
        cleanup(); localStorage.clear();
    });

});
