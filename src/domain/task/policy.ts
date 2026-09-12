import type { Product } from '../../workspace/types';
export function taskStates(product: Product): readonly string[] { return product.kinds.find(kind => kind.key === 'task')?.states ?? []; }
export function canEditTask(product: Product, role: string): boolean { return product.kinds.find(kind => kind.key === 'task')?.editors.includes(role) ?? false; }
export function taskOperations(product: Product, role: string, state: string) { return product.operations.filter(operation => operation.kind === 'task' && operation.roles.includes(role) && operation.from.includes(state)); }
