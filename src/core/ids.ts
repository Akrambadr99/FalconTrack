const valid = /^[a-z0-9][a-z0-9-]{1,79}$/;
export function parseId(value: string): string {
    const clean = value.trim().toLowerCase();
    if (!valid.test(clean))
        throw new Error('Identifier must use lowercase letters, numbers and hyphens.');
    return clean;
}
export function compositeId(...parts: string[]): string { return parts.map(parseId).join('--'); }
export function stableId(prefix: string, value: string): string {
    let hash = 2166136261;
    for (const char of value) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return parseId(prefix) + '-' + (hash >>> 0).toString(36);
}
