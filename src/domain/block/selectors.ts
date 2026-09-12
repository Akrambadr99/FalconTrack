import type { Entity } from '../../workspace/types';
import { matchesSearch } from '../../core/search';
import { isBlock } from './model';
export function selectBlock(records: readonly Entity[]): Entity[] { return records.filter(isBlock).toSorted((a, b) => a.title.localeCompare(b.title)); }
export function findBlock(records: readonly Entity[], id: string): Entity | undefined { return records.find(record => isBlock(record) && record.id === id); }
export function searchBlock(records: readonly Entity[], query: string): Entity[] { return selectBlock(records).filter(record => matchesSearch([record.id, record.title, record.status, ...Object.values(record.fields)], query)); }
export function countBlockByState(records: readonly Entity[]): ReadonlyMap<string, number> {
    const result = new Map<string, number>();
    for (const record of selectBlock(records))
        result.set(record.status, (result.get(record.status) ?? 0) + 1);
    return result;
}
