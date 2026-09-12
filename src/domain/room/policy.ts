import type { Product } from '../../workspace/types';
export function roomStates(product: Product): readonly string[] { return product.kinds.find(kind => kind.key === 'room')?.states ?? []; }
export function canEditRoom(product: Product, role: string): boolean { return product.kinds.find(kind => kind.key === 'room')?.editors.includes(role) ?? false; }
export function roomOperations(product: Product, role: string, state: string) { return product.operations.filter(operation => operation.kind === 'room' && operation.roles.includes(role) && operation.from.includes(state)); }
