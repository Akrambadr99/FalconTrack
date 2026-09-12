/* eslint-disable react-refresh/only-export-components, @typescript-eslint/no-confusing-void-expression */
import { useState } from 'react';
import type { Entity, Snapshot } from '../../workspace/types';
const overlaps = (startA: string, endA: string, startB: string, endB: string) => startA < endB && startB < endA;
export function roomMovePlan(stay: Entity | undefined, destination: Entity | undefined, entities: Entity[], effectiveDate: string) {
    const blockers: string[] = [];
    if (!stay || !destination)
        return { ready: false, blockers: ['Stay and destination room are required.'] };
    const departure = String(stay.fields['departure'] ?? '');
    if (stay.status !== 'checked-in')
        blockers.push('Only an in-house guest can move rooms.');
    if (destination.id === stay.fields['room'] || destination.status !== 'ready')
        blockers.push('Choose a different ready room.');
    if (effectiveDate < String(stay.fields['arrival'] ?? '') || effectiveDate >= departure)
        blockers.push('Move date must fall within the active stay.');
    const occupied = entities.some((item) => item.kind === 'stay' && item.id !== stay.id && item.fields['room'] === destination.id && !['cancelled', 'checked-out'].includes(item.status) && overlaps(effectiveDate, departure, String(item.fields['arrival'] ?? ''), String(item.fields['departure'] ?? '')));
    const blocked = entities.some((item) => item.kind === 'block' && item.fields['room'] === destination.id && item.status === 'scheduled' && overlaps(effectiveDate, departure, String(item.fields['start'] ?? ''), String(item.fields['end'] ?? '')));
    if (occupied)
        blockers.push('Destination room has an overlapping stay.');
    if (blocked)
        blockers.push('Destination room has an overlapping maintenance block.');
    return { ready: blockers.length === 0, blockers };
}
export function DomainLifecyclePanel({ snapshot }: { snapshot: Snapshot }) {
    const stays = snapshot.entities.filter((item) => item.kind === 'stay');
    const rooms = snapshot.entities.filter((item) => item.kind === 'room');
    const [stayId, setStayId] = useState(stays[0]?.id ?? '');
    const [roomId, setRoomId] = useState(rooms[1]?.id ?? rooms[0]?.id ?? '');
    const [effectiveDate, setEffectiveDate] = useState('2026-09-13');
    const result = roomMovePlan(stays.find((item) => item.id === stayId), rooms.find((item) => item.id === roomId), snapshot.entities, effectiveDate);
    return <section className="sub" aria-label="Room move planner"><h3>Room move planner <span>{result.ready ? 'ready' : 'blocked'}</span></h3><div className="filters"><select aria-label="Move stay" value={stayId} onChange={(event) => setStayId(event.target.value)}>{stays.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select aria-label="Destination room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>{rooms.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><input aria-label="Move date" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)}/></div><p><b>Effective {effectiveDate}</b><small>{result.ready ? 'Occupancy and maintenance constraints allow this room move.' : result.blockers.join(' ')}</small></p></section>;
}
