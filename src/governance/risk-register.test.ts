import { describe, expect, it } from 'vitest';
import { orderedRisks, riskLevel, riskScore } from './risk-register';
const risk = (id: string, likelihood: number, impact: number) => ({ id, title: id, likelihood, impact, owner: 'Ops', mitigation: 'Review' });
describe('risk register', () => { it('classifies risk bands', () => expect(riskLevel(riskScore(risk('x', 5, 4)))).toBe('critical')); it('orders highest first', () => expect(orderedRisks([risk('low', 1, 1), risk('high', 4, 4)])[0]?.id).toBe('high')); });
