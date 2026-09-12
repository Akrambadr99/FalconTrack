export function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
    const seen = new Set<string>();
    return items.filter(item => {
        const value = key(item);
        if (seen.has(value))
            return false;
        seen.add(value);
        return true;
    });
}
export function indexBy<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, T> {
    const result = new Map<string, T>();
    for (const item of items) {
        const id = key(item);
        if (result.has(id))
            throw new Error('Duplicate collection key: ' + id);
        result.set(id, item);
    }
    return result;
}
export function groupBy<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, T[]> {
    const result = new Map<string, T[]>();
    for (const item of items) {
        const id = key(item), group = result.get(id) ?? [];
        group.push(item);
        result.set(id, group);
    }
    return result;
}
export function replaceById<T extends {
    id: string;
}>(items: readonly T[], next: T): T[] {
    if (!items.some(item => item.id === next.id))
        throw new Error('Record was not found.');
    return items.map(item => item.id === next.id ? next : item);
}
