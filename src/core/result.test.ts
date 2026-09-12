import { describe, expect, it } from 'vitest';
import { err, mapResult, ok, unwrap } from './result';
describe('result', () => { it('maps success', () => expect(mapResult(ok(2), v => v * 3)).toEqual(ok(6))); it('preserves errors', () => expect(mapResult(err('bad'), v => v)).toEqual(err('bad'))); it('throws on unwrap error', () => expect(() => unwrap(err('bad'))).toThrow(/bad/)); });
