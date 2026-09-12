const day = /^\d{4}-\d{2}-\d{2}$/;
export function parseDay(value: string): Date {
    if (!day.test(value))
        throw new Error('Expected an ISO calendar date.');
    const parsed = new Date(value + 'T00:00:00.000Z');
    if (parsed.toISOString().slice(0, 10) !== value)
        throw new Error('Calendar date does not exist.');
    return parsed;
}
export function daysBetween(start: string, end: string): number { return Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / 86400000); }
export function addDays(value: string, days: number): string {
    if (!Number.isInteger(days))
        throw new Error('Days must be an integer.');
    const result = parseDay(value);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}
export function isOverdue(due: string, asOf: string, complete = false): boolean { return !complete && parseDay(due) < parseDay(asOf); }
