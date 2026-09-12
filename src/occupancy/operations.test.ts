import { describe, expect, it } from 'vitest';
import { rooms, stays } from './fixtures';
import { assignTasks, transitionRoom, type RoomTask } from './housekeeping';
import { inventoryPosition, walkCandidates } from './overbooking';
import { cancellationCharge, priceStay, type RatePlan } from './rates';
describe('rate plan behavior', () => {
    const plan: RatePlan = { id: 'FLEX-K', roomType: 'King', nightly: 220, currency: 'USD', minimumNights: 2, refundable: true, closedDates: ['2027-03-20'] };
    it('prices occupied nights and applies cancellation terms', () => {
        expect(priceStay(plan, '2027-03-15', '2027-03-18')).toEqual({ nights: 3, subtotal: 660 });
        expect(() => priceStay(plan, '2027-03-15', '2027-03-16')).toThrow(/at least 2/);
        expect(() => priceStay(plan, '2027-03-19', '2027-03-22')).toThrow(/closed/);
        expect(cancellationCharge(plan, 660, '2027-03-12', '2027-03-15')).toBe(0);
        expect(cancellationCharge(plan, 660, '2027-03-14', '2027-03-15')).toBe(220);
        expect(cancellationCharge({ ...plan, refundable: false }, 100, '2027-03-12', '2027-03-15')).toBe(100);
    });
});
describe('housekeeping and sellable inventory', () => {
    const task: RoomTask = { id: 'T-1', roomId: '302', kind: 'inspection', state: 'done', dueAt: '2027-03-15T14:30:00Z' };
    it('requires cleaning and inspection state transitions', () => {
        const dirty = rooms.find((room) => room.id === '302')!;
        expect(transitionRoom(dirty, 'inspecting').state).toBe('inspecting');
        expect(transitionRoom({ ...dirty, state: 'inspecting' }, 'ready', task).state).toBe('ready');
        expect(() => transitionRoom(dirty, 'ready', task)).toThrow(/cannot move/);
        expect(() => transitionRoom({ ...dirty, state: 'inspecting' }, 'ready')).toThrow(/inspection/);
        expect(transitionRoom(rooms[0]!, 'out-of-service').state).toBe('out-of-service');
        expect(transitionRoom(rooms[3]!, 'dirty').state).toBe('dirty');
    });
    it('balances queued tasks and calculates authorized overbooking', () => {
        const tasks = [{ ...task, state: 'queued' as const }, { ...task, id: 'T-2', state: 'queued' as const }, { ...task, id: 'T-3', state: 'done' as const }];
        expect(assignTasks(tasks, ['Ana', 'Mira']).map((item) => item.assignee)).toEqual(['Ana', 'Mira', undefined]);
        expect(assignTasks(tasks, [])).toEqual(tasks);
        expect(inventoryPosition(rooms, stays, 'King', '2027-03-16', '2027-03-18', 1)).toEqual({ physical: 3, booked: 2, authorizedOverbook: 1, sellable: 2 });
        expect(walkCandidates(stays, rooms.map((room) => ({ ...room, state: 'dirty' })), '2027-03-15')).toHaveLength(1);
    });
});
