import type { Context } from '../workspace/types';
import { find, number, requireThat, rows, text } from '../workspace/values';

function unusedNightCredit(context: Context, stayId: string, folioId: string, departure: string) {
    const stay = find(context.state.entities, stayId, 'stay'), folio = find(context.state.entities, folioId, 'folio');
    const bookedArrival = folio.fields['bookedArrival'], bookedDeparture = folio.fields['bookedDeparture'], bookedRate = folio.fields['bookedRate'];
    requireThat(typeof bookedArrival === 'string' && typeof bookedDeparture === 'string' && typeof bookedRate === 'number' && Number.isSafeInteger(bookedRate) && bookedRate > 0,
        'Authoritative booked-night pricing is missing. Resolve the legacy folio pricing before requesting an early-departure credit.');
    const start = Date.parse(departure), end = Date.parse(text(stay.fields, 'departure'));
    requireThat(Number.isFinite(start) && Number.isFinite(end) && end > start && (end - start) / 86400000 <= 730, 'Early departure must remove a bounded, valid booked-night period.');
    const extensions = rows(context.state.entities, 'extension').filter((item) => item.fields['stay'] === stay.id).toReversed();
    let credit = 0;
    for (let day = start; day < end; day += 86400000) {
        const date = new Date(day).toISOString().slice(0, 10);
        const extension = extensions.find((item) => date >= text(item.fields, 'previousDeparture') && date < text(item.fields, 'newDeparture'));
        const rate = extension ? number(extension.fields, 'rate') : date >= bookedArrival && date < bookedDeparture ? bookedRate : 0;
        requireThat(Number.isSafeInteger(rate) && rate > 0, 'A removed night has no authoritative booking or extension price.');
        credit += rate;
    }
    requireThat(Number.isSafeInteger(credit), 'Unused night credit is outside the supported currency range.');
    return credit;
}
function departureDecision(context: Context, status: 'approved' | 'rejected' | 'cancelled') {
    const reason = text(context.input, 'reason').trim();
    requireThat(reason.length >= 20, 'Explain the departure decision in at least 20 characters.');
    context.entity.status = status;
    context.entity.fields['decisionActor'] = context.actor.id;
    context.entity.fields['decisionReason'] = reason;
    context.entity.fields['decidedOn'] = context.now;
}
export const departureExecution: Record<string, (context: Context) => string> = {
"departure-request": (context: Context) => {
            const stay = context.entity, departure = text(context.input, 'departure'), previousDeparture = text(stay.fields, 'departure');
            requireThat(departure >= context.now.slice(0, 10) && departure > text(stay.fields, 'arrival') && departure < previousDeparture, 'Earlier departure must be within the current stay and cannot be backdated.');
            requireThat(typeof stay.fields['roomSince'] !== 'string' || departure > stay.fields['roomSince'], 'Earlier departure must retain the current occupied room period.');
            requireThat(!rows(context.state.entities, 'departure-amendment').some((item) => item.fields['stay'] === stay.id && item.status === 'requested'), 'Resolve the existing early-departure review first.');
            requireThat(!rows(context.state.entities, 'move').some((item) => item.fields['stay'] === stay.id && item.status === 'planned'), 'Resolve the planned room move before changing departure.');
            const folios = rows(context.state.entities, 'folio').filter((item) => item.fields['stay'] === stay.id);
            requireThat(folios.length === 1, 'Early departure requires one authoritative guest folio.');
            const folio = folios[0]; requireThat(folio && ['open', 'settled'].includes(folio.status), 'An active guest folio is required.');
            const room = find(context.state.entities, text(stay.fields, 'room'), 'room'); requireThat(room.status === 'occupied', 'The guest assigned room must remain occupied during departure review.');
            const reference = text(context.input, 'reference').trim(), reason = text(context.input, 'reason').trim();
            requireThat(reference.length >= 6 && reason.length >= 20, 'Provide guest departure evidence and a specific rationale.');
            requireThat(!rows(context.state.entities, 'departure-amendment').some((item) => item.fields['stay'] === stay.id && item.fields['reference'] === reference && ['requested', 'approved'].includes(item.status)), 'Guest departure evidence is already used for this stay.');
            const credit = unusedNightCredit(context, stay.id, folio.id, departure);
            context.add('departure-amendment', 'Early departure · ' + stay.title, { stay: stay.id, folio: folio.id, room: room.id, stayVersion: stay.revision, folioVersion: folio.revision, roomVersion: room.revision, previousDeparture, departure, credit, requester: context.actor.id, reference, reason });
            return 'Early departure requested; booked dates and charges remain unchanged until independent review.';
        },
"departure-approve": (context: Context) => {
            const request = context.entity, stay = find(context.state.entities, text(request.fields, 'stay'), 'stay'), folio = find(context.state.entities, text(request.fields, 'folio'), 'folio'), room = find(context.state.entities, text(request.fields, 'room'), 'room');
            requireThat(request.fields['requester'] !== context.actor.id, 'Early departure requires an independent duty manager.');
            requireThat(stay.status === 'checked-in' && room.status === 'occupied' && stay.fields['room'] === room.id && folio.fields['stay'] === stay.id, 'Departure source ownership or occupancy changed. Cancel and request again.');
            requireThat(stay.revision === request.fields['stayVersion'] && folio.revision === request.fields['folioVersion'] && room.revision === request.fields['roomVersion'] && stay.fields['departure'] === request.fields['previousDeparture'], 'Departure sources changed. Cancel and request against the current stay and folio.');
            const departure = text(request.fields, 'departure'); requireThat(departure >= context.now.slice(0, 10), 'The requested departure is now past. Cancel and request current dates.');
            const credit = unusedNightCredit(context, stay.id, folio.id, departure); requireThat(credit === request.fields['credit'], 'Reviewed unused-night pricing changed. Request fresh approval.');
            const charges = number(folio.fields, 'charges') - credit;
            requireThat(charges >= number(folio.fields, 'payments'), 'Early-departure credit would exceed the unpaid balance. Complete an authorized refund first.');
            departureDecision(context, 'approved');
            stay.fields['departure'] = departure; folio.fields['charges'] = charges; folio.status = charges === number(folio.fields, 'payments') ? 'settled' : 'open';
            return 'Early departure approved; unused booked-night credit applied atomically. The room stays occupied until checkout.';
        },
"departure-reject": (context: Context) => { departureDecision(context, 'rejected'); return 'Early departure rejected; stay dates and folio preserved.'; },
"departure-cancel": (context: Context) => { requireThat(context.entity.fields['requester'] === context.actor.id, 'Only the requesting desk agent may cancel this departure review.'); departureDecision(context, 'cancelled'); return 'Early departure cancelled; source dates and charges preserved.'; }
};
