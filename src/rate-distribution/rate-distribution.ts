export type RateRole = 'Revenue Analyst' | 'Revenue Manager' | 'Distribution Operator' | 'Reservation Agent';
export interface RateDistributionState {
  revision: number;
  forecast: { stayDate: string; occupancyPercent: number; version: number };
  inventory: { roomType: string; available: number; reserved: number; version: number };
  rate: { id: string; amount: number; version: number; status: 'published' };
  channels: { id: 'DIRECT' | 'OTA'; rateVersion: number; amount: number; status: 'synced' | 'failed' }[];
  change: null | { id: string; status: 'draft' | 'approved' | 'published' | 'rolled-back'; proposedAmount: number; previousAmount: number; forecastVersion: number; inventoryVersion: number; rateVersion: number; owner: string; approver?: string };
  bookings: { id: string; channel: string; rateVersion: number; amount: number; status: 'confirmed' }[];
  events: { id: string; action: string; actor: string; detail: string }[];
}
export const initialRateDistributionState: RateDistributionState = { revision: 0, forecast: { stayDate: '2026-10-18', occupancyPercent: 86, version: 8 }, inventory: { roomType: 'Deluxe King', available: 20, reserved: 14, version: 6 }, rate: { id: 'BAR-DLX', amount: 240, version: 11, status: 'published' }, channels: [{ id: 'DIRECT', rateVersion: 11, amount: 240, status: 'synced' }, { id: 'OTA', rateVersion: 11, amount: 240, status: 'synced' }], change: null, bookings: [], events: [] };
interface Meta { id: string; expectedRevision: number; actor: { id: string; role: RateRole } }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function begin(state: RateDistributionState, command: Meta) { assert(state.revision === command.expectedRevision, 'Rate distribution changed. Refresh before retrying.'); assert(!state.events.some((event) => event.id === command.id), 'Command already applied.'); return structuredClone(state); }
function finish(state: RateDistributionState, command: Meta, action: string, detail: string) { state.revision += 1; state.events.push({ id: command.id, action, actor: command.actor.id, detail }); return state; }
function currentChange(state: RateDistributionState) { assert(state.change, 'No rate change exists.'); return state.change; }
function assertCurrent(state: RateDistributionState) { const change = currentChange(state); assert(change.forecastVersion === state.forecast.version, 'Occupancy forecast changed after rate drafting.'); assert(change.inventoryVersion === state.inventory.version, 'Room inventory changed after rate drafting.'); assert(change.rateVersion === state.rate.version, 'Published rate changed after rate drafting.'); }

export function draftRateChange(state: RateDistributionState, command: Meta & { proposedAmount: number }) {
  assert(command.actor.role === 'Revenue Analyst', 'Only revenue analysts can draft rate changes.');
  const next = begin(state, command);
  assert(!next.change, 'An active rate change already exists.');
  assert(next.forecast.occupancyPercent >= 80, 'Occupancy does not support a peak-rate change.');
  assert(command.proposedAmount >= next.rate.amount && command.proposedAmount <= next.rate.amount * 1.25, 'Proposed rate is outside the governed range.');
  next.change = { id: `${command.id}-change`, status: 'draft', proposedAmount: command.proposedAmount, previousAmount: next.rate.amount, forecastVersion: next.forecast.version, inventoryVersion: next.inventory.version, rateVersion: next.rate.version, owner: command.actor.id };
  return finish(next, command, 'rate-change-drafted', String(command.proposedAmount));
}

export function approveRateChange(state: RateDistributionState, command: Meta) {
  assert(command.actor.role === 'Revenue Manager', 'Only revenue managers can approve rate changes.');
  const next = begin(state, command), change = currentChange(next);
  assert(change.status === 'draft' && command.actor.id !== change.owner, 'Independent rate approval is required.');
  assertCurrent(next);
  assert(next.inventory.available - next.inventory.reserved > 0, 'No sellable rooms remain for rate publication.');
  change.status = 'approved'; change.approver = command.actor.id;
  return finish(next, command, 'rate-change-approved', change.id);
}

export function publishRate(state: RateDistributionState, command: Meta & { failedChannel?: 'DIRECT' | 'OTA' }) {
  assert(command.actor.role === 'Distribution Operator', 'Only distribution operators can publish rates.');
  const next = begin(state, command), change = currentChange(next);
  assert(change.status === 'approved', 'Approved rate change is required.');
  assertCurrent(next);
  next.rate.amount = change.proposedAmount; next.rate.version += 1;
  for (const channel of next.channels) {
    if (channel.id === command.failedChannel) { channel.status = 'failed'; continue; }
    channel.amount = change.proposedAmount; channel.rateVersion = next.rate.version; channel.status = 'synced';
  }
  change.rateVersion = next.rate.version;
  if (next.channels.some((channel) => channel.status === 'failed')) {
    next.rate.amount = change.previousAmount; next.rate.version += 1;
    for (const channel of next.channels) { channel.amount = change.previousAmount; channel.rateVersion = next.rate.version; channel.status = 'synced'; }
    change.rateVersion = next.rate.version; change.status = 'rolled-back';
    return finish(next, command, 'rate-publication-rolled-back', command.failedChannel ?? 'unknown');
  }
  change.status = 'published';
  return finish(next, command, 'rate-published', String(next.rate.version));
}

export function confirmBooking(state: RateDistributionState, command: Meta & { channel: 'DIRECT' | 'OTA'; quotedRateVersion: number }) {
  assert(command.actor.role === 'Reservation Agent', 'Only reservation agents can confirm bookings.');
  const next = begin(state, command);
  assert(next.change?.status === 'published', 'A fully published rate is required.');
  const channel = next.channels.find((item) => item.id === command.channel);
  assert(channel?.status === 'synced' && channel.rateVersion === command.quotedRateVersion && command.quotedRateVersion === next.rate.version, 'Quoted room rate is stale. Refresh before booking.');
  assert(next.inventory.reserved < next.inventory.available, 'No room inventory remains.');
  next.inventory.reserved += 1; next.inventory.version += 1;
  next.bookings.push({ id: `${command.id}-booking`, channel: command.channel, rateVersion: next.rate.version, amount: next.rate.amount, status: 'confirmed' });
  return finish(next, command, 'rate-booking-confirmed', command.channel);
}

export class RateDistributionRepository {
  static key = 'staypilot:rate-distribution:v1';
  private storage: Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage; }
  read() { const raw = this.storage.getItem(RateDistributionRepository.key); return raw ? JSON.parse(raw) as RateDistributionState : structuredClone(initialRateDistributionState); }
  commit(expectedRevision: number, operation: (state: RateDistributionState) => RateDistributionState) { const current = this.read(); assert(current.revision === expectedRevision, 'Another session changed rate distribution. Refresh before retrying.'); const next = operation(current); this.storage.setItem(RateDistributionRepository.key, JSON.stringify(next)); return next; }
}
