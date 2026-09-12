export interface FilterState {
    query: string;
    kinds: string[];
    statuses: string[];
    owner?: string;
}
export function encodeFilters(filters: FilterState): string {
    const params = new URLSearchParams();
    if (filters.query)
        params.set('q', filters.query);
    for (const kind of [...filters.kinds].sort())
        params.append('kind', kind);
    for (const status of [...filters.statuses].sort())
        params.append('status', status);
    if (filters.owner)
        params.set('owner', filters.owner);
    return params.toString();
}
export function decodeFilters(value: string): FilterState { const params = new URLSearchParams(value); const owner = params.get('owner'); return { query: params.get('q') ?? '', kinds: params.getAll('kind'), statuses: params.getAll('status'), ...(owner ? { owner } : {}) }; }
