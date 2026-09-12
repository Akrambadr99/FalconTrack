import type { Command, Product, Snapshot, Value } from '../../workspace/types';
import { execute } from '../../workspace/engine';
import { findBlock } from './selectors';
export function createBlockCommand(input: {
    id: string;
    actorId: string;
    revision: number;
    title: string;
    fields: Record<string, Value>;
}): Command { return { id: input.id, actorId: input.actorId, expectedRevision: input.revision, type: 'create', kind: 'block', title: input.title, input: input.fields }; }
export function applyBlockCommand(state: Snapshot, command: Command, product: Product, at: string): Snapshot { return execute(state, command, product, at); }
export function requireBlock(state: Snapshot, id: string) {
    const record = findBlock(state.entities, id);
    if (!record)
        throw new Error('Block record was not found.');
    return record;
}
