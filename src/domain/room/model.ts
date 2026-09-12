import type { Entity } from '../../workspace/types';
export type RoomRecord = Entity & {
    kind: 'room';
};
export function isRoom(record: Entity): record is RoomRecord { return record.kind === 'room'; }
