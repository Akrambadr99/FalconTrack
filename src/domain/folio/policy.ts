import type { Product } from '../../workspace/types';
export function folioStates(product: Product): readonly string[] { return product.kinds.find(kind => kind.key === 'folio')?.states ?? []; }
export function canEditFolio(product: Product, role: string): boolean { return product.kinds.find(kind => kind.key === 'folio')?.editors.includes(role) ?? false; }
export function folioOperations(product: Product, role: string, state: string) { return product.operations.filter(operation => operation.kind === 'folio' && operation.roles.includes(role) && operation.from.includes(state)); }
