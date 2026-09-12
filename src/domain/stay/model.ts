import type { Entity } from '../../workspace/types';
export type StayRecord = Entity & {
    kind: 'stay';
};
export function isStay(record: Entity): record is StayRecord { return record.kind === 'stay'; }
