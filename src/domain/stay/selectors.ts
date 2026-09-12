import type { Entity } from '../../workspace/types';
import { matchesSearch } from '../../core/search';
import { isStay } from './model';
export function selectStay(records: readonly Entity[]): Entity[] { return records.filter(isStay).toSorted((a, b) => a.title.localeCompare(b.title)); }
export function findStay(records: readonly Entity[], id: string): Entity | undefined { return records.find(record => isStay(record) && record.id === id); }
export function searchStay(records: readonly Entity[], query: string): Entity[] { return selectStay(records).filter(record => matchesSearch([record.id, record.title, record.status, ...Object.values(record.fields)], query)); }
export function countStayByState(records: readonly Entity[]): ReadonlyMap<string, number> {
    const result = new Map<string, number>();
    for (const record of selectStay(records))
        result.set(record.status, (result.get(record.status) ?? 0) + 1);
    return result;
}
