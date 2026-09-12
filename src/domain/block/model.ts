import type { Entity } from '../../workspace/types';
export type BlockRecord = Entity & {
    kind: 'block';
};
export function isBlock(record: Entity): record is BlockRecord { return record.kind === 'block'; }
