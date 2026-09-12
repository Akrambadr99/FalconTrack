export interface RatePlan {
    id: string;
    roomType: string;
    nightly: number;
    currency: 'USD' | 'EUR';
    minimumNights: number;
    refundable: boolean;
    closedDates: string[];
}
const nights = (arrival: string, departure: string) => Math.ceil((new Date(departure).getTime() - new Date(arrival).getTime()) / 86400000);
export function priceStay(plan: RatePlan, arrival: string, departure: string): {
    nights: number;
    subtotal: number;
} {
    const count = nights(arrival, departure);
    if (count < plan.minimumNights)
        throw new Error(`Rate plan requires at least ${String(plan.minimumNights)} nights.`);
    if (plan.closedDates.some((date) => date >= arrival.slice(0, 10) && date < departure.slice(0, 10)))
        throw new Error('Rate plan is closed for one or more stay dates.');
    return { nights: count, subtotal: count * plan.nightly };
}
export function cancellationCharge(plan: RatePlan, subtotal: number, cancelledAt: string, arrival: string): number {
    if (plan.refundable && new Date(arrival).getTime() - new Date(cancelledAt).getTime() >= 48 * 3600000)
        return 0;
    return Math.min(plan.nightly, subtotal);
}
