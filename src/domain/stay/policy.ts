import type { Product } from '../../workspace/types';
export function stayStates(product: Product): readonly string[] { return product.kinds.find(kind => kind.key === 'stay')?.states ?? []; }
export function canEditStay(product: Product, role: string): boolean { return product.kinds.find(kind => kind.key === 'stay')?.editors.includes(role) ?? false; }
export function stayOperations(product: Product, role: string, state: string) { return product.operations.filter(operation => operation.kind === 'stay' && operation.roles.includes(role) && operation.from.includes(state)); }
