import type { Product } from '../../workspace/types';
export function blockStates(product: Product): readonly string[] { return product.kinds.find(kind => kind.key === 'block')?.states ?? []; }
export function canEditBlock(product: Product, role: string): boolean { return product.kinds.find(kind => kind.key === 'block')?.editors.includes(role) ?? false; }
export function blockOperations(product: Product, role: string, state: string) { return product.operations.filter(operation => operation.kind === 'block' && operation.roles.includes(role) && operation.from.includes(state)); }
