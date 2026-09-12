import type { Entity } from '../../workspace/types';
export type TaskRecord = Entity & {
    kind: 'task';
};
export function isTask(record: Entity): record is TaskRecord { return record.kind === 'task'; }
