import type { Entity } from '../../workspace/types';
import { matchesSearch } from '../../core/search';
import { isRoom } from './model';
export function selectRoom(records: readonly Entity[]): Entity[] { return records.filter(isRoom).toSorted((a, b) => a.title.localeCompare(b.title)); }
export function findRoom(records: readonly Entity[], id: string): Entity | undefined { return records.find(record => isRoom(record) && record.id === id); }
export function searchRoom(records: readonly Entity[], query: string): Entity[] { return selectRoom(records).filter(record => matchesSearch([record.id, record.title, record.status, ...Object.values(record.fields)], query)); }
export function countRoomByState(records: readonly Entity[]): ReadonlyMap<string, number> {
    const result = new Map<string, number>();
    for (const record of selectRoom(records))
        result.set(record.status, (result.get(record.status) ?? 0) + 1);
    return result;
}
