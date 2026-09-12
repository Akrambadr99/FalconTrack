import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isOverdue, parseDay } from './dates';
describe('dates', () => { it('rejects invalid calendar days', () => expect(() => parseDay('2026-02-30')).toThrow()); it('calculates day spans', () => expect(daysBetween('2026-09-10', '2026-09-12')).toBe(2)); it('adds days in UTC', () => expect(addDays('2026-12-31', 1)).toBe('2027-01-01')); it('respects completion', () => expect(isOverdue('2026-09-10', '2026-09-12', true)).toBe(false)); });
