import { PageTitle } from '../../components/PageTitle';
import { RiskBadge } from '../../components/RiskBadge';
import { SuiteCard } from '../../components/SuiteCard';
import { orderedRisks, riskLevel, riskScore } from '../../governance/risk-register';
const risks = orderedRisks([{ id: 'availability', title: 'Service availability', likelihood: 3, impact: 5, owner: 'Platform', mitigation: 'Outbox retry and recovery drills' }, { id: 'access', title: 'Stale privileged access', likelihood: 2, impact: 5, owner: 'Security', mitigation: 'Quarterly access review' }, { id: 'quality', title: 'Incomplete operational data', likelihood: 3, impact: 3, owner: 'Operations', mitigation: 'Validation and exception queue' }]);
export function GovernancePage() { return <main className="suite-page"><PageTitle eyebrow="GOVERNANCE" title="Risk and control register" detail="Owned risks connect platform safeguards to operational review."/><div className="suite-grid">{risks.map(risk => { const level = riskLevel(riskScore(risk)); return <SuiteCard key={risk.id} title={risk.title} detail={'Owner: ' + risk.owner}><RiskBadge level={level}/><p>{risk.mitigation}</p></SuiteCard>; })}</div></main>; }
