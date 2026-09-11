import type { Room, Stay } from './allocation'

const dates = ['15 Mar', '16 Mar', '17 Mar', '18 Mar', '19 Mar']
const day = ['2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18', '2027-03-19']
export function OccupancyGrid({ rooms, stays }: { rooms: Room[]; stays: Stay[] }) {
  return <div className="occupancy-grid"><div className="calendar-head"><span>ROOM</span>{dates.map((date) => <span key={date}>{date}</span>)}</div>{rooms.map((room) => <div className="room-row" key={room.id}><div><strong>{room.id}</strong><small>{room.type}</small></div>{day.map((date) => { const stay = stays.find((candidate) => candidate.roomId === room.id && candidate.state !== 'cancelled' && candidate.arrival.slice(0, 10) <= date && candidate.departure.slice(0, 10) > date); return <div key={date} className={stay ? 'occupied' : room.state}><span>{stay?.guest.split(' ')[0] ?? room.state}</span></div> })}</div>)}</div>
}
