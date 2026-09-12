import { describe, expect, it } from 'vitest';
import { addMoney, formatMoney, money } from './money';
describe('money', () => { it('uses minor units', () => expect(addMoney([money(120), money(80)]).minor).toBe(200)); it('rejects currency mixing', () => expect(() => addMoney([money(1, 'USD'), money(1, 'EUR')])).toThrow(/Currency/)); it('formats currency', () => expect(formatMoney(money(1250))).toContain('12.50')); it('rejects unsafe values', () => expect(() => money(Number.MAX_VALUE)).toThrow()); });
