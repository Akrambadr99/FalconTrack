import type { RiskLevel } from '../governance/risk-register';
export function RiskBadge({ level }: {
    level: RiskLevel;
}) { return <span className={'suite-risk suite-risk-' + level}>{level}</span>; }
