export interface ValidationIssue {
    path: string;
    message: string;
    severity: 'error' | 'warning';
}
export class ValidationBag {
    private readonly issues: ValidationIssue[] = [];
    error(path: string, message: string) { this.issues.push({ path, message, severity: 'error' }); }
    warning(path: string, message: string) { this.issues.push({ path, message, severity: 'warning' }); }
    require(condition: unknown, path: string, message: string) {
        if (!condition)
            this.error(path, message);
    }
    result(): readonly ValidationIssue[] { return this.issues; }
    assert(): void {
        const errors = this.issues.filter(issue => issue.severity === 'error');
        if (errors.length)
            throw new Error(errors.map(issue => issue.path + ': ' + issue.message).join(' '));
    }
}
export function required(value: string, label: string): string {
    const clean = value.trim();
    if (!clean)
        throw new Error(label + ' is required.');
    return clean;
}
