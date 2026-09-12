import { describe, expect, it } from 'vitest';
import type { Entity } from '../../workspace/types';
import { roomMovePlan } from './DomainLifecyclePanel';
const entity = (id: string, kind: string, status: string, fields: Entity['fields'] = {}): Entity => ({ id, kind, status, fields, title: id, revision: 1 });
describe('roomMovePlan', () => {
    it('blocks destination maintenance overlap', () => { const stay = entity('s', 'stay', 'checked-in', { room: 'a', arrival: '2026-09-10', departure: '2026-09-15' }), room = entity('b', 'room', 'ready'); expect(roomMovePlan(stay, room, [entity('x', 'block', 'scheduled', { room: 'b', start: '2026-09-12', end: '2026-09-14' })], '2026-09-12').blockers).toContain('Destination room has an overlapping maintenance block.'); });
    it('accepts a different available room during the stay', () => expect(roomMovePlan(entity('s', 'stay', 'checked-in', { room: 'a', arrival: '2026-09-10', departure: '2026-09-15' }), entity('b', 'room', 'ready'), [], '2026-09-12').ready).toBe(true));
});
