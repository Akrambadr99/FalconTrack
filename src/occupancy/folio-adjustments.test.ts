import { describe, expect, it } from 'vitest';
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
