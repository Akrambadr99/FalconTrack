import { folioAdjustmentKind, folioAdjustmentOperations } from '../occupancy/folio-adjustments';
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Product, Kind, Field, Operation, Entity } from '../workspace/types';
import { entity, find, rows, total, text, number, requireThat, money, overlaps } from '../workspace/values';
const txt = (key: string, label: string): Field => ({ key, label, type: 'text', required: true });
const num = (key: string, label: string, initial = 0, min = 0, max = Number.MAX_SAFE_INTEGER): Field => ({ key, label, type: 'number', required: true, integer: true, initial, min, max });
const date = (key: string, label: string): Field => ({ key, label, type: 'date', required: true, initial: '2026-09-12' });
const ref = (key: string, label: string, reference: string): Field => ({ key, label, type: 'reference', reference, required: true });
const choice = (key: string, label: string, options: string[]): Field => ({ key, label, type: 'select', options, required: true, initial: options[0] ?? '' });
const kind = (key: string, label: string, states: string[], editors: string[], fields: Field[]): Kind => ({ key, label, states, editors, fields, initial: states[0] ?? 'draft' });
const linked = (entities: Entity[], kind: string, key: string, id: string) => rows(entities, kind).filter(item => item.fields[key] === id);
void txt;
void num;
void date;
void ref;
void choice;
void kind;
void linked;
void entity;
void find;
void rows;
void total;
void text;
void number;
void requireThat;
void money;
void overlaps;
const roles = ['Duty Manager', 'Front Desk', 'Housekeeping Lead', 'Auditor'];
const kinds = [
    kind('room', 'Room inventory', ['ready', 'occupied', 'dirty', 'inspecting', 'blocked'], [roles[0]!], [choice('type', 'Room type', ['standard', 'suite']), num('rate', 'Nightly rate (cents)', 15000, 1)]),
    kind('stay', 'Guest reservations', ['reserved', 'checked-in', 'checked-out', 'cancelled'], [roles[0]!, roles[1]!], [ref('room', 'Assigned room', 'room'), date('arrival', 'Arrival'), date('departure', 'Departure'), txt('guest', 'Guest name'), { ...txt('reservationId', 'Reservation ID'), required: false }, { ...ref('guestId', 'Guest ID', 'guest'), required: false }]),
    kind('folio', 'Guest folios', ['open', 'settled'], [], [ref('stay', 'Reservation', 'stay'), num('charges', 'Room charges (cents)'), num('payments', 'Payments (cents)'), { key: 'arrivalBlocker', label: 'Arrival payment blocker', type: 'select', options: ['yes', 'no'], required: false }, { ...txt('arrivalClearance', 'Arrival clearance reference'), required: false }]),
    kind('guest', 'Guest identities', ['active'], [], [txt('name', 'Guest name')]),
    kind('task', 'Housekeeping tasks', ['queued', 'cleaned', 'inspected'], [], [ref('room', 'Room', 'room'), ref('stay', 'Departed stay', 'stay'), txt('assignee', 'Assigned team')]),
    kind('block', 'Maintenance blocks', ['scheduled', 'released'], [roles[0]!], [ref('room', 'Room', 'room'), date('start', 'Start date'), date('end', 'End date'), txt('reason', 'Maintenance reason')]),
];
const operations: Operation[] = [
    { key: 'checkin', label: 'Check in guest', kind: 'stay', from: ['reserved'], roles: [roles[0]!, roles[1]!], run: ({ state, entity, now, add }) => { requireThat(!state.entities.some((folio) => folio.kind === 'folio' && folio.fields['stay'] === entity.id && folio.fields['arrivalBlocker'] !== undefined), 'Use the governed recovered-arrival release for registered arrival records.'); const room = find(state.entities, text(entity.fields, 'room')); requireThat(room.status === 'ready', 'Assigned room is not ready.'); requireThat(now.slice(0, 10) >= text(entity.fields, 'arrival') && now.slice(0, 10) < text(entity.fields, 'departure'), 'Check-in must occur within the reserved stay dates.'); room.status = 'occupied'; entity.status = 'checked-in'; const nights = Math.round((Date.parse(text(entity.fields, 'departure')) - Date.parse(text(entity.fields, 'arrival'))) / 86400000); add('folio', 'Folio · ' + entity.title, { stay: entity.id, charges: nights * number(room.fields, 'rate'), payments: 0 }); return 'Guest checked in and room-night charges posted.'; } },
    { key: 'payment', label: 'Post folio payment', kind: 'folio', from: ['open'], roles: [roles[0]!, roles[1]!], fields: [num('amount', 'Payment (cents)', 1000, 1)], run: ({ entity, input }) => {
            const paid = number(entity.fields, 'payments') + number(input, 'amount');
            requireThat(paid <= number(entity.fields, 'charges'), 'Payment exceeds outstanding folio balance.');
            entity.fields['payments'] = paid;
            if (paid === number(entity.fields, 'charges'))
                entity.status = 'settled';
            return 'Guest payment posted to folio.';
        } },
    { key: 'checkout', label: 'Check out and queue clean', kind: 'stay', from: ['checked-in'], roles: [roles[0]!, roles[1]!], run: ({ state, entity, add }) => { requireThat(!rows(state.entities, 'folio-adjustment').some(item => item.status === 'requested' && linked(state.entities, 'folio', 'stay', entity.id).some(folio => folio.id === item.fields['folio'])), 'Resolve pending folio adjustments before checkout.'); requireThat(linked(state.entities, 'folio', 'stay', entity.id).every(row => row.status === 'settled'), 'Settle the guest folio before checkout.'); entity.status = 'checked-out'; const room = find(state.entities, text(entity.fields, 'room')); room.status = 'dirty'; add('task', 'Checkout clean · ' + room.title, { room: room.id, stay: entity.id, assignee: 'Housekeeping team' }); return 'Guest checked out; room marked dirty and cleaning task created.'; } },
    { key: 'clean', label: 'Finish room cleaning', kind: 'task', from: ['queued'], roles: [roles[2]!], run: ({ state, entity }) => { const room = find(state.entities, text(entity.fields, 'room')); requireThat(room.status === 'dirty', 'Room must be dirty before cleaning.'); entity.status = 'cleaned'; room.status = 'inspecting'; return 'Cleaning complete; room awaits inspection.'; } },
    { key: 'inspect', label: 'Pass room inspection', kind: 'task', from: ['cleaned'], roles: [roles[0]!, roles[2]!], run: ({ state, entity, actor, now, add }) => { const room = find(state.entities, text(entity.fields, 'room')); requireThat(room.status === 'inspecting', 'Room is not awaiting inspection.'); add('inspection-record','Passed room inspection - '+room.title,{task:entity.id,room:room.id,result:'passed',inspector:actor.id,at:now,note:'Room accepted after housekeeping inspection.'}); entity.status = 'inspected'; room.status = 'ready'; return 'Inspection passed; room returned to ready inventory.'; } },
    { key: 'cancel', label: 'Cancel reservation', kind: 'stay', from: ['reserved'], roles: [roles[0]!, roles[1]!], run: ({ entity }) => { entity.status = 'cancelled'; return 'Reservation cancelled and room dates released.'; } },
    { key: 'release', label: 'Release maintenance block', kind: 'block', from: ['scheduled'], roles: [roles[0]!], run: ({ entity }) => { entity.status = 'released'; return 'Maintenance date block released.'; } },
];
const seed = [entity('room-1', 'room', 'Room 204', 'ready', { type: 'standard', rate: 15000 }), entity('room-2', 'room', 'Room 501', 'ready', { type: 'suite', rate: 28000 }), entity('stay-1', 'stay', 'Maya Hassan · September', 'reserved', { room: 'room-1', arrival: '2026-09-12', departure: '2026-09-15', guest: 'Maya Hassan' }), entity('ROOM-512', 'room', 'Room 512', 'blocked', { type: 'standard', rate: 15000 }), entity('ROOM-824', 'room', 'Room 824', 'ready', { type: 'standard', rate: 15000 }), entity('ROOM-826', 'room', 'Room 826', 'ready', { type: 'standard', rate: 15000 }), entity('guest-5812', 'guest', 'Nora Hassan', 'active', { name: 'Nora Hassan' }), entity('stay-5812', 'stay', 'Nora Hassan · October', 'reserved', { room: 'ROOM-512', arrival: '2026-10-20', departure: '2026-10-22', guest: 'Nora Hassan', guestId: 'guest-5812', reservationId: 'RES-5812' }), entity('folio-5812', 'folio', 'Nora Hassan · pre-arrival folio', 'open', { stay: 'stay-5812', charges: 0, payments: 0, arrivalBlocker: 'yes' })];
kinds.find(item => item.key === 'stay')!.fields.push({ key: 'roomSince', label: 'Current room occupied since', type: 'date', required: false });
kinds.push(kind('move', 'Room move requests', ['planned', 'completed', 'cancelled'], [], [ref('stay', 'Guest stay', 'stay'), ref('source', 'Previous room', 'room'), ref('target', 'Destination room', 'room'), num('stayVersion', 'Stay version', 1, 1), num('targetVersion', 'Destination version', 1, 1), txt('owner', 'Requesting actor'), txt('reason', 'Move reason'), { ...date('movedOn', 'Move date'), required: false }]));
const occupancyStart = (stay: Entity) => typeof stay.fields['roomSince'] === 'string' && stay.fields['roomSince'].length > 0 ? text(stay.fields, 'roomSince') : text(stay.fields, 'arrival');
const moveFields = [ref('target', 'Destination room', 'room'), txt('reason', 'Move reason')];
const moveDetails = (entities: Entity[], stay: Entity, input: Record<string, string | number | boolean>) => {
    requireThat(stay.status === 'checked-in', 'Room moves require a checked-in stay.');
    const target = find(entities, text(input, 'target'), 'room');
    requireThat(target.id !== stay.fields['room'], 'Choose a different destination room.');
    requireThat(text(input, 'reason').trim().length >= 12, 'Provide a specific reason for the room move.');
    return { stay: stay.id, source: text(stay.fields, 'room'), target: target.id, stayVersion: stay.revision, targetVersion: target.revision, reason: text(input, 'reason').trim() };
};
kinds.push(kind('inspection-record','Room inspection history',['recorded'],[],[ref('task','Cleaning task','task'),ref('room','Inspected room','room'),choice('result','Inspection result',['passed','failed']),txt('inspector','Inspecting actor'),txt('at','Inspection time'),txt('note','Inspection findings')]));
operations.push(
    {key:'fail-room-inspection',label:'Reject room inspection',kind:'task',from:['cleaned'],roles:[roles[0]!,roles[2]!],fields:[txt('note','Inspection findings')],run:({state,entity,actor,input,now,add}) => {
        const room=find(state.entities,text(entity.fields,'room'),'room');
        requireThat(room.status === 'inspecting','Room is not awaiting inspection.');
        requireThat(text(input,'note').trim().length >= 12,'Describe the cleaning defect requiring another pass.');
        add('inspection-record','Failed room inspection - '+room.title,{task:entity.id,room:room.id,result:'failed',inspector:actor.id,at:now,note:text(input,'note').trim()});
        entity.status='queued';room.status='dirty';return 'Room inspection rejected; cleaning requeued and room kept unavailable.';
    }},
    { key: 'plan-move', label: 'Plan guest room move', kind: 'stay', from: ['checked-in'], roles: [roles[0]!, roles[1]!], fields: moveFields, run: ({ state, entity, actor, input, add }) => {
        requireThat(!rows(state.entities, 'move').some(item => item.fields['stay'] === entity.id && item.status === 'planned'), 'A room move is already planned. Revise or cancel it.');
        add('move', 'Room move · ' + entity.title, { ...moveDetails(state.entities, entity, input), owner: actor.id });
        return 'Room move planned; occupancy changes only when the move is executed.';
    } },
    { key: 'revise-move', label: 'Revise guest room move', kind: 'move', from: ['planned'], roles: [roles[0]!, roles[1]!], fields: moveFields, run: ({ state, entity, actor, input }) => {
        requireThat(entity.fields['owner'] === actor.id || actor.role === 'Duty Manager', 'Only the requester or duty manager may revise the move.');
        Object.assign(entity.fields, moveDetails(state.entities, find(state.entities, text(entity.fields, 'stay'), 'stay'), input));
        return 'Room move refreshed against current stay and destination versions.';
    } },
    { key: 'cancel-move', label: 'Cancel guest room move', kind: 'move', from: ['planned'], roles: [roles[0]!, roles[1]!], run: ({ entity, actor }) => { requireThat(entity.fields['owner'] === actor.id || actor.role === 'Duty Manager', 'Only the requester or duty manager may cancel the move.'); entity.status = 'cancelled'; return 'Room move cancelled without changing occupancy.'; } },
    { key: 'execute-move', label: 'Execute guest room move', kind: 'move', from: ['planned'], roles: [roles[0]!, roles[1]!], run: ({ state, entity, actor, now, add }) => {
        requireThat(entity.fields['owner'] === actor.id || actor.role === 'Duty Manager', 'Only the requester or duty manager may execute the move.');
        const stay = find(state.entities, text(entity.fields, 'stay'), 'stay');
        const source = find(state.entities, text(entity.fields, 'source'), 'room');
        const target = find(state.entities, text(entity.fields, 'target'), 'room');
        const day = now.slice(0, 10);
        requireThat(stay.status === 'checked-in' && stay.fields['room'] === source.id && source.status === 'occupied', 'Guest occupancy changed. Review the stay before retrying.');
        requireThat(stay.revision === entity.fields['stayVersion'] && target.revision === entity.fields['targetVersion'], 'Stay or destination changed. Revise the move before retrying.');
        requireThat(day >= text(stay.fields, 'arrival') && day < text(stay.fields, 'departure'), 'Move date must be within the guest stay.');
        requireThat(target.status === 'ready' && !linked(state.entities, 'task', 'room', target.id).some(item => item.status !== 'inspected'), 'Destination room is not ready or housekeeping remains open.');
        requireThat(!linked(state.entities, 'stay', 'room', target.id).some(item => ['reserved', 'checked-in'].includes(item.status) && overlaps(day, text(stay.fields, 'departure'), occupancyStart(item), text(item.fields, 'departure'))), 'Destination has a conflicting reservation.');
        requireThat(!linked(state.entities, 'block', 'room', target.id).some(item => item.status === 'scheduled' && overlaps(day, text(stay.fields, 'departure'), text(item.fields, 'start'), text(item.fields, 'end'))), 'Destination has a conflicting maintenance block.');
        source.status = 'dirty';
        target.status = 'occupied';
        stay.fields['room'] = target.id;
        stay.fields['roomSince'] = day;
        entity.fields['movedOn'] = day;
        entity.status = 'completed';
        add('task', 'Move departure clean · ' + source.title, { room: source.id, stay: stay.id, assignee: 'Housekeeping team' });
        return 'Guest moved: destination occupied, previous room dirty, cleaning queued; booked folio charges preserved.';
    } },
);
kinds.push(kind('extension','Stay extension history',['recorded'],[],[ref('stay','Guest stay','stay'),ref('room','Extended room','room'),date('previousDeparture','Previous departure'),date('newDeparture','New departure'),num('rate','Nightly rate (cents)',1,1),num('charge','Added charges (cents)',1,1),txt('actor','Extending actor'),txt('reason','Extension reason')]));
operations.push({key:'extend-stay',label:'Extend in-house stay',kind:'stay',from:['checked-in'],roles:[roles[0]!,roles[1]!],fields:[date('departure','New departure'),txt('reason','Extension reason')],run:({state,entity,actor,input,add}) => {
    const previous=text(entity.fields,'departure'),next=text(input,'departure'),room=find(state.entities,text(entity.fields,'room'),'room');
    requireThat(next > previous,'New departure must be after the current departure.');
    requireThat(room.status === 'occupied','The currently assigned room is not occupied by this stay.');
    requireThat(!rows(state.entities,'move').some(item => item.fields['stay'] === entity.id && item.status === 'planned'),'Resolve the planned room move before extending this stay.');
    requireThat(!linked(state.entities,'stay','room',room.id).some(item => item.id !== entity.id && !['cancelled','checked-out'].includes(item.status) && overlaps(previous,next,occupancyStart(item),text(item.fields,'departure'))),'Room has a conflicting reservation during the extension.');
    requireThat(!linked(state.entities,'block','room',room.id).some(item => item.status === 'scheduled' && overlaps(previous,next,text(item.fields,'start'),text(item.fields,'end'))),'Room has a maintenance block during the extension.');
    const folios=linked(state.entities,'folio','stay',entity.id);
    requireThat(folios.length === 1 && folios[0]!.status === 'open','A unique open folio is required before extending the stay.');
    requireThat(text(input,'reason').trim().length >= 12,'Provide a specific stay extension reason.');
    const nights=Math.round((Date.parse(next)-Date.parse(previous))/86400000),rate=number(room.fields,'rate'),charge=nights*rate;
    folios[0]!.fields['charges']=number(folios[0]!.fields,'charges')+charge;entity.fields['departure']=next;
    add('extension','Extension · '+entity.title,{stay:entity.id,room:room.id,previousDeparture:previous,newDeparture:next,rate,charge,actor:actor.id,reason:text(input,'reason').trim()});
    return 'Stay extended by '+String(nights)+' nights; open folio increased by the current room rate.';
}});
kinds.push(folioAdjustmentKind);
operations.push(...folioAdjustmentOperations);
const validate: Product['validate'] = entities => {
    for (const stay of rows(entities, 'stay')) { const since = stay.fields['roomSince']; requireThat(!since || (typeof since === 'string' && since >= text(stay.fields, 'arrival') && since < text(stay.fields, 'departure')), 'Current occupancy date must be within the reserved stay.'); }
    const stays = rows(entities, 'stay').filter(row => !['cancelled', 'checked-out'].includes(row.status));
    for (const stay of rows(entities, 'stay'))
        requireThat(text(stay.fields, 'arrival') < text(stay.fields, 'departure'), 'Departure must follow arrival.');
    for (const block of rows(entities, 'block'))
        requireThat(text(block.fields, 'start') < text(block.fields, 'end'), 'Maintenance end must follow start.');
    for (const [index, stay] of stays.entries()) {
        for (const other of stays.slice(index + 1))
            requireThat(stay.fields['room'] !== other.fields['room'] || !overlaps(occupancyStart(stay), text(stay.fields, 'departure'), occupancyStart(other), text(other.fields, 'departure')), 'Room is already reserved for these dates.');
        for (const block of rows(entities, 'block').filter(row => row.status === 'scheduled' && row.fields['room'] === stay.fields['room']))
            requireThat(!overlaps(occupancyStart(stay), text(stay.fields, 'departure'), text(block.fields, 'start'), text(block.fields, 'end')), 'Stay conflicts with room maintenance.');
    }
};
const metrics: Product['metrics'] = entities => [{ label: 'Ready rooms', value: String(rows(entities, 'room').filter(row => row.status === 'ready').length) }, { label: 'In-house guests', value: String(rows(entities, 'stay').filter(row => row.status === 'checked-in').length) }, { label: 'Outstanding folios', value: money(total(rows(entities, 'folio'), 'charges') - total(rows(entities, 'folio'), 'payments')) }];
export const product: Product = { name: 'StayPilot', description: 'Reservations, guest folios and room turnaround', accent: '#7e22ce', actors: roles.map((role, index) => ({ id: 'actor-' + String(index), name: ['Maya Hassan', 'Omar Saleh', 'Lina Farouk', 'Nadia Ali'][index] ?? role, role })), kinds, operations, seed, validate, metrics };
