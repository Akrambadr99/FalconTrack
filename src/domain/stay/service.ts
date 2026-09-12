import type { Command, Product, Snapshot, Value } from '../../workspace/types';
import { execute } from '../../workspace/engine';
import { findStay } from './selectors';
export function createStayCommand(input: {
    id: string;
    actorId: string;
    revision: number;
    title: string;
    fields: Record<string, Value>;
}): Command { return { id: input.id, actorId: input.actorId, expectedRevision: input.revision, type: 'create', kind: 'stay', title: input.title, input: input.fields }; }
export function applyStayCommand(state: Snapshot, command: Command, product: Product, at: string): Snapshot { return execute(state, command, product, at); }
export function requireStay(state: Snapshot, id: string) {
    const record = findStay(state.entities, id);
    if (!record)
        throw new Error('Stay record was not found.');
    return record;
}
