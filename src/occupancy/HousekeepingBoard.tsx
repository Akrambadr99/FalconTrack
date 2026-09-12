import type { Room } from './allocation';
export function HousekeepingBoard({ rooms, onReady }: {
    rooms: Room[];
    onReady: (id: string) => void;
}) {
    const columns = ['dirty', 'inspecting', 'ready', 'out-of-service'] as const;
    return <div className="housekeeping-board">{columns.map((state) => <section key={state}><header><span>{state}</span><strong>{rooms.filter((room) => room.state === state).length}</strong></header>{rooms.filter((room) => room.state === state).map((room) => <article key={room.id}><strong>Room {room.id}</strong><small>{room.type} · floor {room.floor}</small>{state === 'inspecting' && <button onClick={() => { onReady(room.id); }}>Pass inspection</button>}</article>)}</section>)}</div>;
}
