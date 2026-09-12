import { describe, expect, it } from 'vitest';
import { advance, assertRevision, compareRevision } from './revision';
describe('revision', () => { it('advances immutably', () => { const a = { revision: 2 }; expect(advance(a)).toEqual({ revision: 3 }); expect(a.revision).toBe(2); }); it('rejects stale revision', () => expect(() => assertRevision({ revision: 3 }, 2)).toThrow(/conflict/)); it('compares revisions', () => expect(compareRevision({ revision: 2 }, { revision: 3 })).toBe('older')); });
