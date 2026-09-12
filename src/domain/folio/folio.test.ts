import { describe, expect, it } from 'vitest';
import { product } from '../../product/definition';
import { fresh } from '../../workspace/engine';
import { analyzeFolio } from './analytics';
import { canEditFolio, folioStates } from './policy';
import { countFolioByState, searchFolio, selectFolio } from './selectors';
describe('folio domain module', () => { const records = fresh(product).entities; it('selects only folio records', () => expect(selectFolio(records).every(record => record.kind === 'folio')).toBe(true)); it('searches deterministic fields', () => { const first = selectFolio(records)[0]; expect(first ? searchFolio(records, first.title).map(row => row.id) : []).toEqual(first ? [first.id] : []); }); it('summarizes states', () => expect([...countFolioByState(records).values()].reduce((sum, value) => sum + value, 0)).toBe(selectFolio(records).length)); it('exposes configured states', () => expect(folioStates(product).length).toBeGreaterThan(0)); it('reports analytics', () => expect(analyzeFolio(records).total).toBe(selectFolio(records).length)); it('applies edit policy', () => expect(canEditFolio(product, product.actors[0]!.role)).toBe(product.kinds.find(kind => kind.key === 'folio')!.editors.includes(product.actors[0]!.role))); });
