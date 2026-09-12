export type Currency = 'USD' | 'EUR';
export interface Money {
    minor: number;
    currency: Currency;
}
export function money(minor: number, currency: Currency = 'USD'): Money {
    if (!Number.isSafeInteger(minor))
        throw new Error('Money must use safe integer minor units.');
    return { minor, currency };
}
export function addMoney(values: readonly Money[]): Money {
    const currency = values[0]?.currency ?? 'USD';
    if (values.some(value => value.currency !== currency))
        throw new Error('Currency mismatch.');
    return money(values.reduce((sum, value) => sum + value.minor, 0), currency);
}
export function formatMoney(value: Money): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: value.currency }).format(value.minor / 100); }
