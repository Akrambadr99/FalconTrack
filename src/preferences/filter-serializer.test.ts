import { describe, expect, it } from 'vitest';
import { decodeFilters, encodeFilters } from './filter-serializer';
describe('filter serializer', () => { it('round trips filters', () => { const encoded = encodeFilters({ query: 'risk', kinds: ['task'], statuses: ['open'], owner: 'u1' }); expect(decodeFilters(encoded)).toEqual({ query: 'risk', kinds: ['task'], statuses: ['open'], owner: 'u1' }); }); });
