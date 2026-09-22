import type { Command, Product, Snapshot } from './types';
import { execute, fresh } from './engine';
import { decode } from './validation';
import { requireThat } from './values';
export interface StoragePort {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}
export async function coordinateWorkspaceWrite<T>(key: string, operation: () => T): Promise<T> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator)
        return navigator.locks.request(key, operation);
    return operation();
}
export class Repository {
    readonly key: string;
    private readonly product: Product;
    private readonly storage: StoragePort;
    constructor(product: Product, storage: StoragePort) { this.product = product; this.storage = storage; this.key = product.name.toLowerCase() + ':workspace:v1'; }
    read(): Snapshot { const raw = this.storage.getItem(this.key); return raw === null ? fresh(this.product) : decode(raw, this.product); }
    commitCoordinated(command: Command, now: string): Promise<Snapshot> { return coordinateWorkspaceWrite(this.key, () => this.commit(command, now)); }
    commit(command: Command, now: string): Snapshot {
        const before = this.read();
        const next = execute(before, command, this.product, now);
        if (next !== before) {
            requireThat(this.read().revision === before.revision, 'Another client changed the authoritative workspace before this command was saved. Refresh and retry.');
            this.storage.setItem(this.key, JSON.stringify(next));
        }
        return next;
    }
    restoreCoordinated(raw: string, expectedRevision: number, actorId: string, now: string): Promise<Snapshot> { return coordinateWorkspaceWrite(this.key, () => this.restore(raw, expectedRevision, actorId, now)); }
    restore(raw: string, expectedRevision: number, actorId: string, now: string): Snapshot {
        const actor = this.product.actors.find(actor => actor.id === actorId);
        requireThat(actor?.role === this.product.actors[0]?.role, 'Workspace owner authority is required to restore a backup.');
        if (!actor)
            throw new Error('Unknown workspace actor.');
        const current = this.read();
        requireThat(current.revision === expectedRevision, 'Workspace changed before restore. Refresh first.');
        const candidate = decode(raw, this.product);
        const next: Snapshot = { ...candidate, revision: current.revision + 1, receipts: current.receipts, audit: [...current.audit, { id: 'restore-' + String(current.revision + 1), at: now, actor: actor.name, action: 'restore', entityIds: [], summary: 'Restored validated backup from revision ' + String(candidate.revision) }] };
        requireThat(this.read().revision === current.revision, 'Another client changed the authoritative workspace before restore was saved. Refresh and retry.');
        this.storage.setItem(this.key, JSON.stringify(next));
        return next;
    }
}
