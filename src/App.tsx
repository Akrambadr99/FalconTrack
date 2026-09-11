import { useMemo, useState } from 'react'
import { ArrivalQueue } from './occupancy/ArrivalQueue'
import { assignRoom, occupancy, type HotelRole, type Room, type Stay } from './occupancy/allocation'
import { blocks, rooms as initialRooms, stays as initialStays } from './occupancy/fixtures'
import { HousekeepingBoard } from './occupancy/HousekeepingBoard'
import { inventoryPosition } from './occupancy/overbooking'
import { OccupancyGrid } from './occupancy/OccupancyGrid'

type Operation = 'occupancy' | 'arrivals' | 'housekeeping' | 'guest service' | 'revenue'

function App() {
  const [operation, setOperation] = useState<Operation>('occupancy')
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const [stays, setStays] = useState<Stay[]>(initialStays)
  const [role, setRole] = useState<HotelRole>('Duty Manager')
  const [message, setMessage] = useState('')
  const occupancyRate = occupancy(stays, '2027-03-16T18:00:00Z', rooms.length)
  const kingInventory = useMemo(() => inventoryPosition(rooms, stays, 'King', '2027-03-16', '2027-03-18', 1), [rooms, stays])

  function allocate(stay: Stay, room: Room) {
    try { const assigned = assignRoom(stay, room, stays, blocks, role); setStays((current) => current.map((candidate) => candidate.id === stay.id ? assigned : candidate)); setMessage(`${stay.guest} assigned to room ${room.id}; overlap and maintenance constraints passed.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Room allocation failed.') }
  }

  return <div className="hotel-app"><header className="hotel-header"><div className="hotel-brand"><span>SP</span><div><strong>StayPilot</strong><small>HOSPITALITY OPERATIONS</small></div></div><div className="property"><span>PROPERTY</span><strong>The Atrium Cairo</strong><small>Local time 16:20</small></div><label>Operating role<select aria-label="Hotel role" value={role} onChange={(event) => { setRole(event.target.value as HotelRole) }}><option>Front Desk</option><option>Housekeeping Lead</option><option>Revenue Manager</option><option>Duty Manager</option></select></label></header>
    <nav className="hotel-nav" aria-label="Hotel operations">{(['occupancy', 'arrivals', 'housekeeping', 'guest service', 'revenue'] as Operation[]).map((item) => <button key={item} aria-current={operation === item ? 'page' : undefined} onClick={() => { setOperation(item) }}>{item}</button>)}</nav>
    <main>{message && <p className="hotel-message" role="status">{message}</p>}
      {operation === 'occupancy' && <><HotelHeading label="ROOM INVENTORY" title="Occupancy calendar" detail="Room assignments are interval allocations across arrival, departure, moves, and maintenance blocks." /><div className="hotel-kpis"><Kpi label="Tonight occupancy" value={`${String(occupancyRate)}%`} /><Kpi label="Arrivals" value="2" /><Kpi label="Ready rooms" value={String(rooms.filter((room) => room.state === 'ready').length)} /><Kpi label="Guest requests" value="4" /></div><OccupancyGrid rooms={rooms} stays={stays} /></>}
      {operation === 'arrivals' && <><HotelHeading label="FRONT DESK" title="Arrivals board" detail="Assignment checks room type, readiness, stay overlap, and maintenance availability." /><ArrivalQueue stays={stays} rooms={rooms} onAssign={allocate} /></>}
      {operation === 'housekeeping' && <><HotelHeading label="ROOM TURN" title="Housekeeping board" detail="A completed inspection gates the transition from cleaned to guest-ready." /><HousekeepingBoard rooms={rooms} onReady={(id) => { setRooms((current) => current.map((room) => room.id === id ? { ...room, state: 'ready' } : room)); setMessage(`Room ${id} passed inspection and returned to sellable inventory.`) }} /></>}
      {operation === 'guest service' && <><HotelHeading label="IN-HOUSE CARE" title="Guest-service queue" detail="Requests remain tied to the active stay segment when a guest moves rooms." /><div className="guest-queue"><Request room="301" guest="Leila Haddad" request="Late checkout until 14:00" priority="approval" /><Request room="401" guest="Amina Cole" request="Extra bedding" priority="in progress" /><Request room="302" guest="Arrival prep" request="Hypoallergenic pillows" priority="due 17:00" /></div></>}
      {operation === 'revenue' && <><HotelHeading label="SELLABLE INVENTORY" title="Revenue controls" detail="Authorized overbooking is separate from physical room inventory." /><section className="inventory-position"><div><span>PHYSICAL KING ROOMS</span><strong>{kingInventory.physical}</strong></div><div><span>BOOKED IN WINDOW</span><strong>{kingInventory.booked}</strong></div><div><span>OVERBOOK AUTHORITY</span><strong>+{kingInventory.authorizedOverbook}</strong></div><div><span>SELLABLE</span><strong>{kingInventory.sellable}</strong></div></section></>}
    </main></div>
}

function HotelHeading({ label, title, detail }: { label: string; title: string; detail: string }) { return <div className="hotel-heading"><span>{label}</span><h1>{title}</h1><p>{detail}</p></div> }
function Kpi({ label, value }: { label: string; value: string }) { return <article><span>{label}</span><strong>{value}</strong></article> }
function Request({ room, guest, request, priority }: { room: string; guest: string; request: string; priority: string }) { return <article><span>{room}</span><div><strong>{request}</strong><small>{guest}</small></div><b>{priority}</b></article> }
export default App
