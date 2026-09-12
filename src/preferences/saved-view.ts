export interface SavedView {
    id: string;
    name: string;
    query: string;
    kind: string;
    statuses: string[];
    sort: 'title' | 'status' | 'revision';
}
export function applySavedView<T extends {
    title: string;
    kind: string;
    status: string;
    revision: number;
}>(rows: readonly T[], view: SavedView): T[] { const query = view.query.trim().toLowerCase(); return rows.filter(row => (view.kind === 'all' || row.kind === view.kind) && (view.statuses.length === 0 || view.statuses.includes(row.status)) && (!query || row.title.toLowerCase().includes(query))).sort((a, b) => view.sort === 'revision' ? b.revision - a.revision : a[view.sort].localeCompare(b[view.sort])); }
