import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearch, rankSearch, tokenize } from './search';
describe('search', () => { it('normalizes accents', () => expect(normalizeSearch('Résumé')).toBe('resume')); it('tokenizes whitespace', () => expect(tokenize(' one  two ')).toEqual(['one', 'two'])); it('matches all tokens', () => expect(matchesSearch(['Priority', 'Incident'], 'incident prior')).toBe(true)); it('ranks prefixes higher', () => expect(rankSearch('priority', 'pri')).toBeGreaterThan(rankSearch('low priority', 'pri'))); });
