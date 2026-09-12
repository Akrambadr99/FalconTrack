import { describe, expect, it } from 'vitest';
import { retainedAudit } from './retention';
const entry = { id: 'a', actor: 'u', action: 'export', entityIds: [], summary: 'done' };
describe('retention', () => { it('expires governed audit entries', () => expect(retainedAudit([{ ...entry, at: '2026-01-01' }], [{ action: 'export', days: 30 }], new Date('2026-09-12')).length).toBe(0)); it('retains actions without a rule', () => expect(retainedAudit([{ ...entry, action: 'edit', at: '2020-01-01' }], [], new Date('2026-09-12')).length).toBe(1)); });
