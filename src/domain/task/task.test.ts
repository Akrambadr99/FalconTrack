import { describe, expect, it } from 'vitest';
import { product } from '../../product/definition';
import { fresh } from '../../workspace/engine';
import { analyzeTask } from './analytics';
import { canEditTask, taskStates } from './policy';
import { countTaskByState, searchTask, selectTask } from './selectors';
describe('task domain module', () => { const records = fresh(product).entities; it('selects only task records', () => expect(selectTask(records).every(record => record.kind === 'task')).toBe(true)); it('searches deterministic fields', () => { const first = selectTask(records)[0]; expect(first ? searchTask(records, first.title).map(row => row.id) : []).toEqual(first ? [first.id] : []); }); it('summarizes states', () => expect([...countTaskByState(records).values()].reduce((sum, value) => sum + value, 0)).toBe(selectTask(records).length)); it('exposes configured states', () => expect(taskStates(product).length).toBeGreaterThan(0)); it('reports analytics', () => expect(analyzeTask(records).total).toBe(selectTask(records).length)); it('applies edit policy', () => expect(canEditTask(product, product.actors[0]!.role)).toBe(product.kinds.find(kind => kind.key === 'task')!.editors.includes(product.actors[0]!.role))); });
