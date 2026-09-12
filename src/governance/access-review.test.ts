import { describe, expect, it } from 'vitest';
import { reviewAccess } from './access-review';
describe('access review', () => { it('raises a high finding for stale privileged access', () => expect(reviewAccess([{ userId: 'u', role: 'admin', lastActiveAt: '2025-01-01', privileged: true }], 30, new Date('2026-09-12'))[0]?.severity).toBe('high')); });
