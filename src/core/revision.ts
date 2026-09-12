export interface Revisioned {
    revision: number;
}
export function assertRevision(record: Revisioned, expected: number): void {
    if (!Number.isSafeInteger(expected) || record.revision !== expected)
        throw new Error('Revision conflict. Refresh the record before retrying.');
}
export function advance<T extends Revisioned>(record: T): T { return { ...record, revision: record.revision + 1 }; }
export function compareRevision(left: Revisioned, right: Revisioned): 'older' | 'same' | 'newer' { return left.revision < right.revision ? 'older' : left.revision > right.revision ? 'newer' : 'same'; }
