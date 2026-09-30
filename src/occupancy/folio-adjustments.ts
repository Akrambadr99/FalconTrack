import type { Context, Field, Kind, Operation } from '../workspace/types';
import { find, number, requireThat, rows, text } from '../workspace/values';
const note: Field = { key: 'note', label: 'Adjustment rationale', type: 'text', required: true };
const inputFields: Field[] = [
    { key: 'amount', label: 'Adjustment amount (cents)', type: 'number', min: 1, integer: true, required: true },
    { key: 'direction', label: 'Adjustment direction', type: 'select', options: ['credit', 'debit'], initial: 'credit', required: true },
    { key: 'reference', label: 'Adjustment reference', type: 'text', required: true }, note,
];
export const folioAdjustmentKind: Kind = {
    key: 'folio-adjustment', label: 'Folio adjustments', initial: 'requested', editors: [],
    states: ['requested', 'approved', 'rejected', 'cancelled'],
    fields: [...inputFields,
        { key: 'folio', label: 'Guest folio', type: 'reference', reference: 'folio', required: true },
        { key: 'folioVersion', label: 'Folio version', type: 'number', min: 1, integer: true, required: true },
        { key: 'requester', label: 'Requesting actor', type: 'text', required: true },
    ],
};
function rationale(context: Context) {
    const value = text(context.input, 'note').trim();
    requireThat(value.length >= 20, 'Explain the adjustment in at least 20 characters.');
    return value;
}
function inHouse(context: Context, folioId: string) {
    const folio = find(context.state.entities, folioId, 'folio');
    requireThat(find(context.state.entities, text(folio.fields, 'stay'), 'stay').status === 'checked-in', 'Adjustments require an in-house guest stay.');
    return folio;
}
export const folioAdjustmentOperations: Operation[] = [
    {
        key: 'adjustment-request', label: 'Request folio adjustment', kind: 'folio', from: ['open', 'settled'], roles: ['Front Desk'], fields: inputFields,
        run: context => {
            inHouse(context, context.entity.id);
            const reference = text(context.input, 'reference').trim();
            requireThat(reference.length >= 6, 'Adjustment reference requires at least six characters.');
            requireThat(!rows(context.state.entities, 'folio-adjustment').some(item => item.fields['folio'] === context.entity.id && item.fields['reference'] === reference && ['requested', 'approved'].includes(item.status)), 'Adjustment reference is already in use for this folio.');
            context.add('folio-adjustment', 'Adjustment - ' + reference, { folio: context.entity.id, folioVersion: context.entity.revision,
                requester: context.actor.id, amount: number(context.input, 'amount'), direction: text(context.input, 'direction'), reference, note: rationale(context) });
            return 'Folio adjustment requested; charges remain unchanged pending manager approval.';
        },
    },
    {
        key: 'adjustment-approve', label: 'Approve and apply adjustment', kind: 'folio-adjustment', from: ['requested'], roles: ['Duty Manager'], fields: [note],
        run: context => {
            const folio = inHouse(context, text(context.entity.fields, 'folio'));
            requireThat(folio.revision === context.entity.fields['folioVersion'], 'Folio changed. Cancel this adjustment and request it against the current balance.');
            requireThat(context.entity.fields['requester'] !== context.actor.id, 'Adjustment requires an independent duty manager.');
            const charges = number(folio.fields, 'charges') + number(context.entity.fields, 'amount') * (context.entity.fields['direction'] === 'credit' ? -1 : 1);
            requireThat(charges >= number(folio.fields, 'payments'), 'Credit would reduce charges below collected payments; a refund workflow is required.');
            const note = rationale(context);
            folio.fields['charges'] = charges;
            folio.status = charges === number(folio.fields, 'payments') ? 'settled' : 'open';
            context.entity.status = 'approved';
            return 'Approved adjustment applied to folio charges and settlement state: ' + note;
        },
    },
    {
        key: 'adjustment-reject', label: 'Reject folio adjustment', kind: 'folio-adjustment', from: ['requested'], roles: ['Duty Manager'], fields: [note],
        run: context => { const note = rationale(context);context.entity.status = 'rejected';return 'Folio adjustment rejected without changing charges: ' + note; },
    },
    {
        key: 'adjustment-cancel', label: 'Cancel folio adjustment', kind: 'folio-adjustment', from: ['requested'], roles: ['Front Desk'], fields: [note],
        run: context => {
            requireThat(context.entity.fields['requester'] === context.actor.id, 'Only the requesting desk agent may cancel this adjustment.');
            const note = rationale(context);context.entity.status = 'cancelled';return 'Folio adjustment cancelled: ' + note;
        },
    },
];


const departureField = (key: string, label: string, type: Field['type'], required = true): Field => ({ key, label, type, required });
const departureReason = departureField('reason', 'Early departure rationale', 'text');
const departureEvidence = departureField('reference', 'Guest departure evidence', 'text');
export const departureAmendmentKind: Kind = {
    key: 'departure-amendment', label: 'Early departure reviews', initial: 'requested', editors: [],
    states: ['requested', 'approved', 'rejected', 'cancelled'],
    fields: [
        ...([['stay', 'Guest stay'], ['folio', 'Guest folio'], ['room', 'Occupied room']] as const).map(([key, label]): Field => ({ ...departureField(key, label, 'reference'), reference: key })),
        ...['stayVersion', 'folioVersion', 'roomVersion'].map((key): Field => ({ ...departureField(key, key, 'number'), min: 1, integer: true })),
        departureField('previousDeparture', 'Previous departure', 'date'),
        departureField('departure', 'Requested departure', 'date'),
        { ...departureField('credit', 'Unused night credit (cents)', 'number'), min: 1, integer: true },
        departureField('requester', 'Requesting desk agent', 'text'),
        departureEvidence, departureReason,
        departureField('decisionActor', 'Decision actor', 'text', false),
        departureField('decisionReason', 'Decision rationale', 'text', false),
        departureField('decidedOn', 'Decision timestamp', 'text', false),
    ],
};
let loadedDepartureExecution: Record<string, (context: Context) => string> | undefined;
function executeLoadedDeparture(key: string, context: Context) {
    const run = loadedDepartureExecution?.[key];
    requireThat(run, 'Departure command is not loaded. Retry.');
    return run(context);
}
/** Only departure commands load their execution code; discovery and saved record validation remain synchronous. */
export async function prepareDepartureOperation(operation: string) {
    if (!operation.startsWith('departure-') || loadedDepartureExecution) return;
    try { loadedDepartureExecution = (await import('./departure-amendments')).departureExecution; }
    catch { throw new Error('Departure failed to load.', { cause: 'departure-load' }); }
}
function departureDecisionOperation(key: string, label: string, role = 'Duty Manager'): Operation {
    return { key, label, kind: 'departure-amendment', from: ['requested'], roles: [role], fields: [departureReason], run: (context) => executeLoadedDeparture(key, context) };
}
export const departureAmendmentOperations: Operation[] = [
    {
        key: 'departure-request', label: 'Request early departure review', kind: 'stay', from: ['checked-in'], roles: ['Front Desk'],
        fields: [departureField('departure', 'Earlier departure date', 'date'), departureEvidence, departureReason],
        run: (context) => executeLoadedDeparture('departure-request', context),
    },
    departureDecisionOperation('departure-approve', 'Approve early departure and credit'),
    departureDecisionOperation('departure-reject', 'Reject early departure'),
    departureDecisionOperation('departure-cancel', 'Cancel early departure request', 'Front Desk'),
];
