import type { Entity } from '../../workspace/types';
import { matchesSearch } from '../../core/search';
import { isTask } from './model';
export function selectTask(records: readonly Entity[]): Entity[] { return records.filter(isTask).toSorted((a, b) => a.title.localeCompare(b.title)); }
export function findTask(records: readonly Entity[], id: string): Entity | undefined { return records.find(record => isTask(record) && record.id === id); }
export function searchTask(records: readonly Entity[], query: string): Entity[] { return selectTask(records).filter(record => matchesSearch([record.id, record.title, record.status, ...Object.values(record.fields)], query)); }
export function countTaskByState(records: readonly Entity[]): ReadonlyMap<string, number> {
    const result = new Map<string, number>();
    for (const record of selectTask(records))
        result.set(record.status, (result.get(record.status) ?? 0) + 1);
    return result;
}
