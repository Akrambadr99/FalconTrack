export interface AuditRecord {
    at: string;
    actor: string;
    action: string;
    entityId: string;
    beforeRevision: number | null;
    afterRevision: number | null;
    details: Readonly<Record<string, string>>;
}
export function auditRecord(input: AuditRecord): AuditRecord {
    if (!Number.isFinite(Date.parse(input.at)) || !input.actor.trim() || !input.action.trim() || !input.entityId.trim())
        throw new Error('Audit record identity is incomplete.');
    return { ...input, details: { ...input.details } };
}
export function auditTimeline(records: readonly AuditRecord[], entityId: string): AuditRecord[] { return records.filter(record => record.entityId === entityId).toSorted((a, b) => b.at.localeCompare(a.at)); }
export function summarizeAudit(records: readonly AuditRecord[]): ReadonlyMap<string, number> {
    const counts = new Map<string, number>();
    for (const record of records)
        counts.set(record.action, (counts.get(record.action) ?? 0) + 1);
    return counts;
}
