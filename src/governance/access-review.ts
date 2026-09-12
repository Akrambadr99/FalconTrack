export interface AccessGrant {
    userId: string;
    role: string;
    lastActiveAt: string;
    privileged: boolean;
}
export interface AccessFinding {
    userId: string;
    severity: 'medium' | 'high';
    reason: string;
}
export function reviewAccess(grants: readonly AccessGrant[], inactiveDays: number, now: Date): AccessFinding[] {
    const findings: AccessFinding[] = [];
    for (const grant of grants) {
        const inactive = now.getTime() - new Date(grant.lastActiveAt).getTime() > inactiveDays * 86400000;
        if (grant.privileged && inactive)
            findings.push({ userId: grant.userId, severity: 'high', reason: 'Privileged account is inactive' });
        else if (inactive)
            findings.push({ userId: grant.userId, severity: 'medium', reason: 'Account is inactive' });
    }
    return findings;
}
