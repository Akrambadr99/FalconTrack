export interface Page<T> {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
    pages: number;
}
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200)
        throw new Error('Invalid pagination request.');
    const pages = Math.max(1, Math.ceil(items.length / pageSize)), safe = Math.min(page, pages), start = (safe - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page: safe, pageSize, total: items.length, pages };
}
export function pageWindow(page: number, pages: number, radius = 2): number[] {
    const values: number[] = [];
    for (let value = Math.max(1, page - radius); value <= Math.min(pages, page + radius); value++)
        values.push(value);
    return values;
}
