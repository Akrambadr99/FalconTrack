import { describe, expect, it } from 'vitest';
import { applySavedView } from './saved-view';
const rows = [{ title: 'Beta', kind: 'task', status: 'open', revision: 1 }, { title: 'Alpha', kind: 'task', status: 'done', revision: 2 }];
describe('saved view', () => { it('filters and sorts records', () => expect(applySavedView(rows, { id: 'v', name: 'Open', query: 'be', kind: 'task', statuses: ['open'], sort: 'title' }).map(row => row.title)).toEqual(['Beta'])); });
