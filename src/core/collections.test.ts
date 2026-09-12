import { describe, expect, it } from 'vitest';
import { groupBy, indexBy, replaceById, uniqueBy } from './collections';
const rows = [{ id: 'a', kind: 'x' }, { id: 'b', kind: 'x' }];
describe('collections', () => { it('indexes records', () => expect(indexBy(rows, row => row.id).get('a')?.kind).toBe('x')); it('groups records', () => expect(groupBy(rows, row => row.kind).get('x')).toHaveLength(2)); it('deduplicates', () => expect(uniqueBy([...rows, rows[0]!], row => row.id)).toHaveLength(2)); it('rejects missing replacement', () => expect(() => replaceById(rows, { id: 'c', kind: 'x' })).toThrow()); });
