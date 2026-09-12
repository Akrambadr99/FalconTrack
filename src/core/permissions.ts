export interface PermissionRule {
    role: string;
    capability: string;
    scope: 'workspace' | 'owned' | 'assigned';
}
export function can(rules: readonly PermissionRule[], role: string, capability: string): boolean { return rules.some(rule => rule.role === role && rule.capability === capability); }
export function assertCan(rules: readonly PermissionRule[], role: string, capability: string): void {
    if (!can(rules, role, capability))
        throw new Error(role + ' lacks ' + capability + ' permission.');
}
export function capabilities(rules: readonly PermissionRule[], role: string): string[] { return [...new Set(rules.filter(rule => rule.role === role).map(rule => rule.capability))].sort(); }
