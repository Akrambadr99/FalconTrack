import type { Entity } from '../../workspace/types';
export type FolioRecord = Entity & {
    kind: 'folio';
};
export function isFolio(record: Entity): record is FolioRecord { return record.kind === 'folio'; }
