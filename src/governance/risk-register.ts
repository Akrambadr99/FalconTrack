export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export interface Risk {
    id: string;
    title: string;
    likelihood: number;
    impact: number;
    owner: string;
    mitigation: string;
}
export function riskScore(risk: Risk) { return Math.max(1, Math.min(5, risk.likelihood)) * Math.max(1, Math.min(5, risk.impact)); }
export function riskLevel(score: number): RiskLevel { return score >= 20 ? 'critical' : score >= 12 ? 'high' : score >= 6 ? 'medium' : 'low'; }
export function orderedRisks(risks: readonly Risk[]) { return [...risks].sort((a, b) => riskScore(b) - riskScore(a)); }
