import type { Entity } from '../../workspace/types';
import { selectStay } from './selectors';
export interface StayAnalytics {
    total: number;
    states: Readonly<Record<string, number>>;
    averageRevision: number;
    changed: number;
}
export function analyzeStay(records: readonly Entity[]): StayAnalytics {
    const selected = selectStay(records), states: Record<string, number> = {};
    for (const record of selected)
        states[record.status] = (states[record.status] ?? 0) + 1;
    return { total: selected.length, states, averageRevision: selected.length ? Math.round(selected.reduce((sum, record) => sum + record.revision, 0) / selected.length * 10) / 10 : 0, changed: selected.filter(record => record.revision > 1).length };
}
