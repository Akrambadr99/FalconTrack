import type { Command, Product, Snapshot, Value } from '../../workspace/types';
import { execute } from '../../workspace/engine';
import { findTask } from './selectors';
export function createTaskCommand(input: {
    id: string;
    actorId: string;
    revision: number;
    title: string;
    fields: Record<string, Value>;
}): Command { return { id: input.id, actorId: input.actorId, expectedRevision: input.revision, type: 'create', kind: 'task', title: input.title, input: input.fields }; }
export function applyTaskCommand(state: Snapshot, command: Command, product: Product, at: string): Snapshot { return execute(state, command, product, at); }
export function requireTask(state: Snapshot, id: string) {
    const record = findTask(state.entities, id);
    if (!record)
        throw new Error('Task record was not found.');
    return record;
}
