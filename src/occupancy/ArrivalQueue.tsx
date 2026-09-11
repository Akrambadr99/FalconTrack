import type { Room, Stay } from './allocation'

export function ArrivalQueue({ stays, rooms, onAssign }: { stays: Stay[]; rooms: Room[]; onAssign: (stay: Stay, room: Room) => void }) {
  const arrivals = stays.filter((stay) => stay.state === 'reserved')
  return <div className="arrival-queue">{arrivals.map((stay) => { const room = rooms.find((candidate) => candidate.type === stay.roomType && candidate.state === 'ready' && !stay.roomId); return <article key={stay.id}><time>{stay.arrival.slice(11, 16)}</time><div><span>{stay.id}</span><h2>{stay.guest}</h2><p>{stay.roomType} · {stay.arrival.slice(0, 10)} → {stay.departure.slice(0, 10)}</p></div><div className="assignment"><span>{stay.roomId ? `Room ${stay.roomId}` : room ? `Suggested ${room.id}` : 'No room available'}</span>{!stay.roomId && room && <button onClick={() => { onAssign(stay, room) }}>Assign room</button>}</div></article> })}</div>
}
