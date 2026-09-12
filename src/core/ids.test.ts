import { describe, expect, it } from 'vitest';
import { compositeId, parseId, stableId } from './ids';
describe('ids', () => { it('normalizes ids', () => expect(parseId(' Record-12 ')).toBe('record-12')); it('rejects unsafe ids', () => expect(() => parseId('../bad')).toThrow()); it('creates stable ids', () => expect(stableId('event', 'same')).toBe(stableId('event', 'same'))); it('combines ids', () => expect(compositeId('one', 'two')).toBe('one--two')); });
