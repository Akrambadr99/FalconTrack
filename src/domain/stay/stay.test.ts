import { describe, expect, it } from 'vitest';
import { product } from '../../product/definition';
import { fresh } from '../../workspace/engine';
import { analyzeStay } from './analytics';
import { canEditStay, stayStates } from './policy';
import { countStayByState, searchStay, selectStay } from './selectors';
describe('stay domain module', () => { const records = fresh(product).entities; it('selects only stay records', () => expect(selectStay(records).every(record => record.kind === 'stay')).toBe(true)); it('searches deterministic fields', () => { const first = selectStay(records)[0]; expect(first ? searchStay(records, first.title).map(row => row.id) : []).toEqual(first ? [first.id] : []); }); it('summarizes states', () => expect([...countStayByState(records).values()].reduce((sum, value) => sum + value, 0)).toBe(selectStay(records).length)); it('exposes configured states', () => expect(stayStates(product).length).toBeGreaterThan(0)); it('reports analytics', () => expect(analyzeStay(records).total).toBe(selectStay(records).length)); it('applies edit policy', () => expect(canEditStay(product, product.actors[0]!.role)).toBe(product.kinds.find(kind => kind.key === 'stay')!.editors.includes(product.actors[0]!.role))); });
