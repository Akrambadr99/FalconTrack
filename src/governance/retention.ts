import type { Audit } from '../workspace/types';
export interface RetentionRule {
    action: string;
    days: number;
}
export function retainedAudit(entries: readonly Audit[], rules: readonly RetentionRule[], now: Date): Audit[] {
    return entries.filter(entry => {
        const rule = rules.find(item => item.action === entry.action);
        if (!rule)
            return true;
        return now.getTime() - new Date(entry.at).getTime() <= rule.days * 86400000;
    });
}
