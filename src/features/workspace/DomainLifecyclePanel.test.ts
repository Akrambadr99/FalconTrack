import { describe, expect, it } from 'vitest';
import type { Entity } from '../../workspace/types';
import { roomMovePlan } from './DomainLifecyclePanel';
const entity = (id: string, kind: string, status: string, fields: Entity['fields'] = {}): Entity => ({ id, kind, status, fields, title: id, revision: 1 });
describe('roomMovePlan', () => {
    it('blocks destination maintenance overlap', () => { const stay = entity('s', 'stay', 'checked-in', { room: 'a', arrival: '2026-09-10', departure: '2026-09-15' }), room = entity('b', 'room', 'ready'); expect(roomMovePlan(stay, room, [entity('x', 'block', 'scheduled', { room: 'b', start: '2026-09-12', end: '2026-09-14' })], '2026-09-12').blockers).toContain('Destination room has an overlapping maintenance block.'); });
    it('accepts a different available room during the stay', () => expect(roomMovePlan(entity('s', 'stay', 'checked-in', { room: 'a', arrival: '2026-09-10', departure: '2026-09-15' }), entity('b', 'room', 'ready'), [], '2026-09-12').ready).toBe(true));
});

import { product } from '../../product/definition';
import { execute, fresh } from '../../workspace/engine';
import { Repository } from '../../workspace/repository';
import type { Snapshot, Value } from '../../workspace/types';
const run = (state: Snapshot, id: string, target: string, operation: string, actorId = 'actor-1', input: Record<string, Value> = {}) => execute(state, { id, entityId: target, operation, actorId, input, expectedRevision: state.revision, type: 'operate' }, product, '2026-09-12T10:00:00Z');
const planned = () => run(run(fresh(product), 'checkin', 'stay-1', 'checkin'), 'plan', 'stay-1', 'plan-move', 'actor-1', { target: 'room-2', reason: 'Move guest away from scheduled corridor noise.' });
describe('atomic guest room moves', () => {
    it('updates occupancy and housekeeping together while preserving the guest folio', () => {
        const initial = planned();
        let state = run(initial, 'move', 'plan-1', 'execute-move');
        expect(state.entities.find(item => item.id === 'stay-1')?.fields['room']).toBe('room-2');
        expect(state.entities.find(item => item.id === 'room-1')?.status).toBe('dirty');
        expect(state.entities.find(item => item.id === 'room-2')?.status).toBe('occupied');
        expect(state.entities.find(item => item.id === 'checkin-1')).toEqual(initial.entities.find(item => item.id === 'checkin-1'));
        state = run(state, 'clean', 'move-1', 'clean', 'actor-2');
        state = run(state, 'inspect', 'move-1', 'inspect', 'actor-2');
        expect(state.entities.find(item => item.id === 'room-1')?.status).toBe('ready');
    });
    it('rejects date conflicts without creating any partial housekeeping or occupancy changes', () => {
        const state = planned();
        state.entities.push({ id: 'stay-2', kind: 'stay', title: 'Overlapping booking', status: 'reserved', revision: 1, fields: { room: 'room-2', arrival: '2026-09-13', departure: '2026-09-16', guest: 'Other guest' } });
        const before = structuredClone(state);
        expect(() => run(state, 'move', 'plan-1', 'execute-move')).toThrow('conflicting reservation');
        expect(state).toEqual(before);
    });
    it('requires refreshed destination state and appropriate authority', () => {
        let state = planned();
        const room = state.entities.find(item => item.id === 'room-2');
        if (!room) throw new Error('Missing room');
        room.revision += 1;
        expect(() => run(state, 'stale', 'plan-1', 'execute-move')).toThrow('changed');
        expect(() => run(state, 'wrong-role', 'plan-1', 'execute-move', 'actor-2')).toThrow('role');
        state = run(state, 'refresh', 'plan-1', 'revise-move', 'actor-1', { target: 'room-2', reason: 'Destination inspected and available for guest move.' });
        expect(run(state, 'move', 'plan-1', 'execute-move').entities.find(item => item.id === 'plan-1')?.status).toBe('completed');
    });
    it('recovers from a storage failure without duplicated cleaning tasks', () => {
        const initial = planned();
        let raw = JSON.stringify(initial);
        let fail = true;
        const repository = new Repository(product, { getItem: () => raw, setItem: (_key, value) => { if (fail) throw new Error('Storage unavailable'); raw = value; } });
        const command = { id: 'move', entityId: 'plan-1', operation: 'execute-move', actorId: 'actor-1', input: {}, expectedRevision: initial.revision, type: 'operate' as const };
        expect(() => repository.commit(command, '2026-09-12T10:00:00Z')).toThrow('Storage unavailable');
        expect(repository.read()).toEqual(initial);
        fail = false;
        repository.commit(command, '2026-09-12T10:00:00Z');
        repository.commit(command, '2026-09-12T10:00:00Z');
        expect(repository.read().entities.filter(item => item.kind === 'task')).toHaveLength(1);
    });
});

describe('in-house stay extension',()=>{
 it('extends occupancy and adds only the extra nights to the open folio',()=>{
  let state=run(fresh(product),'checkin','stay-1','checkin');
  state=run(state,'extend','stay-1','extend-stay','actor-1',{departure:'2026-09-17',reason:'Guest extended the business visit.'});
  expect(state.entities.find(item=>item.id==='stay-1')?.fields['departure']).toBe('2026-09-17');
  expect(state.entities.find(item=>item.id==='checkin-1')?.fields['charges']).toBe(75000);
  expect(state.entities.find(item=>item.id==='extend-1')).toMatchObject({kind:'extension',fields:{previousDeparture:'2026-09-15',newDeparture:'2026-09-17',charge:30000}});
 });
 it('rejects reservation conflicts and settled folios without partial changes',()=>{
  const state=run(fresh(product),'checkin','stay-1','checkin');
  state.entities.push(entity('stay-2','stay','reserved',{room:'room-1',arrival:'2026-09-16',departure:'2026-09-18',guest:'Next guest'}));
  const before=structuredClone(state);expect(()=>run(state,'conflict','stay-1','extend-stay','actor-1',{departure:'2026-09-17',reason:'Guest extended the business visit.'})).toThrow('conflicting reservation');expect(state).toEqual(before);
  state.entities.pop();const folio=state.entities.find(item=>item.id==='checkin-1');if(!folio)throw new Error('Missing folio');folio.status='settled';
  const settled=structuredClone(state);expect(()=>run(state,'paid','stay-1','extend-stay','actor-1',{departure:'2026-09-17',reason:'Guest extended the business visit.'})).toThrow('open folio');expect(state).toEqual(settled);
 });
});
