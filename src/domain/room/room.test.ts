import { describe, expect, it } from 'vitest';
import { product } from '../../product/definition';
import { fresh } from '../../workspace/engine';
import { analyzeRoom } from './analytics';
import { canEditRoom, roomStates } from './policy';
import { countRoomByState, searchRoom, selectRoom } from './selectors';
describe('room domain module', () => { const records = fresh(product).entities; it('selects only room records', () => expect(selectRoom(records).every(record => record.kind === 'room')).toBe(true)); it('searches deterministic fields', () => { const first = selectRoom(records)[0]; expect(first ? searchRoom(records, first.title).map(row => row.id) : []).toEqual(first ? [first.id] : []); }); it('summarizes states', () => expect([...countRoomByState(records).values()].reduce((sum, value) => sum + value, 0)).toBe(selectRoom(records).length)); it('exposes configured states', () => expect(roomStates(product).length).toBeGreaterThan(0)); it('reports analytics', () => expect(analyzeRoom(records).total).toBe(selectRoom(records).length)); it('applies edit policy', () => expect(canEditRoom(product, product.actors[0]!.role)).toBe(product.kinds.find(kind => kind.key === 'room')!.editors.includes(product.actors[0]!.role))); });
