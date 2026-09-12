import type { Command, Product, Snapshot, Value } from '../../workspace/types';
import { execute } from '../../workspace/engine';
import { findRoom } from './selectors';
export function createRoomCommand(input: {
    id: string;
    actorId: string;
    revision: number;
    title: string;
    fields: Record<string, Value>;
}): Command { return { id: input.id, actorId: input.actorId, expectedRevision: input.revision, type: 'create', kind: 'room', title: input.title, input: input.fields }; }
export function applyRoomCommand(state: Snapshot, command: Command, product: Product, at: string): Snapshot { return execute(state, command, product, at); }
export function requireRoom(state: Snapshot, id: string) {
    const record = findRoom(state.entities, id);
    if (!record)
        throw new Error('Room record was not found.');
    return record;
}
