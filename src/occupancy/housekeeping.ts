import type { Room, RoomState } from './allocation'

export interface RoomTask { id: string; roomId: string; kind: 'checkout-clean' | 'stayover' | 'inspection'; state: 'queued' | 'assigned' | 'done'; assignee?: string; dueAt: string }
export function transitionRoom(room: Room, target: RoomState, task?: RoomTask): Room {
  const allowed: Record<RoomState, RoomState[]> = { ready: ['dirty', 'out-of-service'], dirty: ['inspecting', 'out-of-service'], inspecting: ['ready', 'dirty', 'out-of-service'], 'out-of-service': ['dirty'] }
  if (!allowed[room.state].includes(target)) throw new Error(`Room ${room.id} cannot move from ${room.state} to ${target}.`)
  if (target === 'ready' && (task?.kind !== 'inspection' || task.state !== 'done')) throw new Error('A completed inspection is required before the room becomes ready.')
  return { ...room, state: target }
}

export function assignTasks(tasks: RoomTask[], attendants: string[]): RoomTask[] {
  if (attendants.length === 0) return tasks
  return tasks.map((task, index) => {
    const assignee = attendants[index % attendants.length]
    return task.state === 'queued' && assignee ? { ...task, state: 'assigned', assignee } : task
  })
}
