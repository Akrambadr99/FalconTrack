export function normalizeSearch(value: string): string { return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().trim(); }
export function tokenize(value: string): string[] { return normalizeSearch(value).split(/\s+/).filter(Boolean); }
export function matchesSearch(haystack: readonly unknown[], query: string): boolean { const text = normalizeSearch(haystack.map(String).join(' ')); return tokenize(query).every(token => text.includes(token)); }
export function rankSearch(label: string, query: string): number { const normalized = normalizeSearch(label), tokens = tokenize(query); return tokens.reduce((score, token) => score + (normalized === token ? 100 : normalized.startsWith(token) ? 25 : normalized.includes(token) ? 5 : 0), 0); }
