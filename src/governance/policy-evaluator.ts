export interface PolicyContext {
    role: string;
    action: string;
    resource: string;
    attributes: Record<string, string | number | boolean>;
}
export interface Policy {
    key: string;
    effect: 'allow' | 'deny';
    matches: (context: PolicyContext) => boolean;
}
export interface PolicyDecision {
    allowed: boolean;
    matched: string[];
    reason: string;
}
export function evaluatePolicies(context: PolicyContext, policies: readonly Policy[]): PolicyDecision { const matched = policies.filter(policy => policy.matches(context)); const denied = matched.some(policy => policy.effect === 'deny'), allowed = !denied && matched.some(policy => policy.effect === 'allow'); return { allowed, matched: matched.map(policy => policy.key), reason: denied ? 'Explicit deny policy matched' : allowed ? 'Allow policy matched' : 'No allow policy matched' }; }
