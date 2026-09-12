import type { Entity } from '../../workspace/types';
import { matchesSearch } from '../../core/search';
import { isFolio } from './model';
export function selectFolio(records: readonly Entity[]): Entity[] { return records.filter(isFolio).toSorted((a, b) => a.title.localeCompare(b.title)); }
export function findFolio(records: readonly Entity[], id: string): Entity | undefined { return records.find(record => isFolio(record) && record.id === id); }
export function searchFolio(records: readonly Entity[], query: string): Entity[] { return selectFolio(records).filter(record => matchesSearch([record.id, record.title, record.status, ...Object.values(record.fields)], query)); }
export function countFolioByState(records: readonly Entity[]): ReadonlyMap<string, number> {
    const result = new Map<string, number>();
    for (const record of selectFolio(records))
        result.set(record.status, (result.get(record.status) ?? 0) + 1);
    return result;
}
