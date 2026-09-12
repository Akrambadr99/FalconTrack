import { describe, expect, it } from 'vitest';
import { paginate, pageWindow } from './pagination';
describe('pagination', () => { it('returns bounded pages', () => expect(paginate([1, 2, 3], 5, 2).page).toBe(2)); it('reports totals', () => expect(paginate([1, 2, 3], 1, 2)).toMatchObject({ total: 3, pages: 2 })); it('rejects invalid sizes', () => expect(() => paginate([], 1, 0)).toThrow()); it('builds a window', () => expect(pageWindow(5, 10, 1)).toEqual([4, 5, 6])); });
