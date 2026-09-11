import type { Room, Stay } from './allocation'
import { overlaps } from './allocation'

export function inventoryPosition(rooms: Room[], stays: Stay[], roomType: string, arrival: string, departure: string, authorizedOverbook: number) {
  const physical = rooms.filter((room) => room.type === roomType && room.state !== 'out-of-service').length
  const booked = stays.filter((stay) => stay.roomType === roomType && stay.state !== 'cancelled' && overlaps(stay, { arrival, departure })).length
  return { physical, booked, authorizedOverbook, sellable: physical + authorizedOverbook - booked }
}

export function walkCandidates(stays: Stay[], rooms: Room[], arrival: string): Stay[] {
  const availableTypes = new Set(rooms.filter((room) => room.state === 'ready').map((room) => room.type))
  return stays.filter((stay) => stay.state === 'reserved' && stay.arrival.slice(0, 10) === arrival.slice(0, 10) && !availableTypes.has(stay.roomType)).sort((a, b) => a.arrival.localeCompare(b.arrival))
}
