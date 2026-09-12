import { describe, expect, it } from 'vitest';
import { evaluatePolicies } from './policy-evaluator';
describe('policy evaluator', () => { it('gives deny precedence', () => expect(evaluatePolicies({ role: 'admin', action: 'delete', resource: 'record', attributes: {} }, [{ key: 'allow', effect: 'allow', matches: () => true }, { key: 'freeze', effect: 'deny', matches: context => context.action === 'delete' }]).allowed).toBe(false)); });
