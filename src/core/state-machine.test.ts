import { describe, expect, it } from 'vitest';
import { canTransition, terminalStates, transition, type TransitionMap } from './state-machine';
type State = 'draft' | 'active' | 'closed';
const map: TransitionMap<State> = { draft: ['active'], active: ['closed'], closed: [] };
describe('state machine', () => { it('checks transitions', () => expect(canTransition(map, 'draft', 'active')).toBe(true)); it('rejects invalid transitions', () => expect(() => transition(map, { status: 'draft', revision: 1 }, 'closed')).toThrow()); it('advances revision', () => expect(transition(map, { status: 'draft', revision: 1 }, 'active').revision).toBe(2)); it('finds terminal states', () => expect(terminalStates(map)).toEqual(['closed'])); });
