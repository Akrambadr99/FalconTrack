import { describe, expect, it } from 'vitest';
import { product } from '../../product/definition';
import { fresh } from '../../workspace/engine';
import { analyzeBlock } from './analytics';
import { canEditBlock, blockStates } from './policy';
import { countBlockByState, searchBlock, selectBlock } from './selectors';
describe('block domain module', () => { const records = fresh(product).entities; it('selects only block records', () => expect(selectBlock(records).every(record => record.kind === 'block')).toBe(true)); it('searches deterministic fields', () => { const first = selectBlock(records)[0]; expect(first ? searchBlock(records, first.title).map(row => row.id) : []).toEqual(first ? [first.id] : []); }); it('summarizes states', () => expect([...countBlockByState(records).values()].reduce((sum, value) => sum + value, 0)).toBe(selectBlock(records).length)); it('exposes configured states', () => expect(blockStates(product).length).toBeGreaterThan(0)); it('reports analytics', () => expect(analyzeBlock(records).total).toBe(selectBlock(records).length)); it('applies edit policy', () => expect(canEditBlock(product, product.actors[0]!.role)).toBe(product.kinds.find(kind => kind.key === 'block')!.editors.includes(product.actors[0]!.role))); });
