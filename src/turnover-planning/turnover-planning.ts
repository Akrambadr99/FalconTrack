export type TurnoverRole = 'Housekeeping Planner' | 'Housekeeping Supervisor' | 'Room Attendant' | 'Inspector' | 'Front Desk';

export interface TurnoverRoom {
  id: string;
  version: number;
  status: 'dirty' | 'assigned' | 'cleaned' | 'rework' | 'inspected' | 'sellable';
  priority: 'arrival' | 'standard';
  minutes: number;
  attendant?: string;
  evidence?: string;
  defect?: string;
}

export interface TurnoverPlanningState {
  revision: number;
  forecast: {
    date: string;
    version: number;
    departures: number;
    arrivals: number;
    earlyArrivals: number;
  };
  staff: {
    version: number;
    attendants: number;
    minutesPerAttendant: number;
    reservedMinutes: number;
  };
  linen: {
    version: number;
    availableSets: number;
    reservedSets: number;
  };
  rooms: TurnoverRoom[];
  plan: null | {
    id: string;
    status: 'draft' | 'approved' | 'executing' | 'inspection' | 'released' | 'cancelled';
    owner: string;
    forecastVersion: number;
    staffVersion: number;
    linenVersion: number;
    roomVersions: Record<string, number>;
    supervisor?: string;
    releasedBy?: string;
  };
  events: {
    id: string;
    action: string;
    actor: string;
    detail: string;
  }[];
}

export const initialTurnoverPlanningState: TurnoverPlanningState = {
  revision: 0,
  forecast: {
    date: '2026-09-14',
    version: 11,
    departures: 3,
    arrivals: 3,
    earlyArrivals: 1,
  },
  staff: {
    version: 7,
    attendants: 2,
    minutesPerAttendant: 120,
    reservedMinutes: 0,
  },
  linen: {
    version: 5,
    availableSets: 8,
    reservedSets: 0,
  },
  rooms: [
    { id: 'ROOM-205', version: 4, status: 'dirty', priority: 'arrival', minutes: 55 },
    { id: 'ROOM-311', version: 6, status: 'dirty', priority: 'standard', minutes: 45 },
    { id: 'ROOM-408', version: 10, status: 'dirty', priority: 'standard', minutes: 50 },
  ],
  plan: null,
  events: [],
};

interface CommandMeta {
  id: string;
  expectedRevision: number;
  actor: { id: string; role: TurnoverRole };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function begin(state: TurnoverPlanningState, command: CommandMeta) {
  assert(state.revision === command.expectedRevision, 'Turnover plan changed. Refresh before retrying.');
  assert(!state.events.some((event) => event.id === command.id), 'Command already applied.');
  return structuredClone(state);
}

function finish(state: TurnoverPlanningState, command: CommandMeta, action: string, detail: string) {
  state.revision += 1;
  state.events.push({ id: command.id, action, actor: command.actor.id, detail });
  return state;
}

function currentPlan(state: TurnoverPlanningState) {
  assert(state.plan, 'No turnover plan exists.');
  return state.plan;
}

function room(state: TurnoverPlanningState, roomId: string) {
  const target = state.rooms.find((item) => item.id === roomId);
  assert(target, 'Turnover room was not found.');
  return target;
}

function assertPlanVersions(state: TurnoverPlanningState) {
  const plan = currentPlan(state);
  assert(plan.forecastVersion === state.forecast.version, 'Departure or arrival forecast changed.');
  assert(plan.staffVersion === state.staff.version, 'Housekeeping staffing changed.');
  assert(plan.linenVersion === state.linen.version, 'Linen inventory changed.');
  for (const target of state.rooms) {
    assert(plan.roomVersions[target.id] === target.version, `Room ${target.id} changed.`);
  }
}

export function draftTurnoverPlan(state: TurnoverPlanningState, command: CommandMeta) {
  assert(command.actor.role === 'Housekeeping Planner', 'Only housekeeping planners can draft turnover plans.');
  const next = begin(state, command);
  assert(!next.plan || ['released', 'cancelled'].includes(next.plan.status), 'An active turnover plan already exists.');
  const dirtyRooms = next.rooms.filter((item) => item.status === 'dirty');
  assert(dirtyRooms.length === next.forecast.departures, 'Dirty rooms do not reconcile to forecast departures.');
  const requiredMinutes = dirtyRooms.reduce((total, item) => total + item.minutes, 0);
  const availableMinutes = next.staff.attendants * next.staff.minutesPerAttendant;
  assert(requiredMinutes <= availableMinutes, 'Staffing capacity cannot cover forecast turnover.');
  assert(dirtyRooms.length <= next.linen.availableSets, 'Linen inventory cannot cover forecast turnover.');
  next.plan = {
    id: `${command.id}-plan`,
    status: 'draft',
    owner: command.actor.id,
    forecastVersion: next.forecast.version,
    staffVersion: next.staff.version,
    linenVersion: next.linen.version,
    roomVersions: Object.fromEntries(next.rooms.map((item) => [item.id, item.version])),
  };
  return finish(next, command, 'turnover-plan-drafted', `${String(requiredMinutes)} minutes`);
}

export function approveTurnoverPlan(state: TurnoverPlanningState, command: CommandMeta) {
  assert(command.actor.role === 'Housekeeping Supervisor', 'Only housekeeping supervisors can approve turnover plans.');
  const next = begin(state, command);
  const plan = currentPlan(next);
  assert(plan.status === 'draft', 'Draft turnover plan is required.');
  assert(command.actor.id !== plan.owner, 'Plan approval must be independent.');
  assertPlanVersions(next);
  const requiredMinutes = next.rooms.reduce((total, item) => total + item.minutes, 0);
  next.staff.reservedMinutes += requiredMinutes;
  next.staff.version += 1;
  next.linen.reservedSets += next.rooms.length;
  next.linen.version += 1;
  plan.staffVersion = next.staff.version;
  plan.linenVersion = next.linen.version;
  plan.status = 'approved';
  plan.supervisor = command.actor.id;
  return finish(next, command, 'turnover-plan-approved', plan.id);
}

export function assignTurnoverRoom(
  state: TurnoverPlanningState,
  command: CommandMeta & { roomId: string; attendantId: string },
) {
  assert(command.actor.role === 'Housekeeping Supervisor', 'Only housekeeping supervisors can assign rooms.');
  const next = begin(state, command);
  const plan = currentPlan(next);
  assert(['approved', 'executing'].includes(plan.status), 'Approved turnover plan is required.');
  assert(command.actor.id === plan.supervisor, 'Approving supervisor owns room assignment.');
  const target = room(next, command.roomId);
  assert(target.status === 'dirty', 'Only dirty rooms can be assigned.');
  assert(plan.roomVersions[target.id] === target.version, 'Room changed before assignment.');
  assert(command.attendantId.trim().length >= 4, 'Room attendant assignment is required.');
  target.status = 'assigned';
  target.attendant = command.attendantId.trim();
  target.version += 1;
  plan.roomVersions[target.id] = target.version;
  plan.status = 'executing';
  return finish(next, command, 'turnover-room-assigned', `${target.id}:${target.attendant}`);
}

export function completeRoomCleaning(
  state: TurnoverPlanningState,
  command: CommandMeta & { roomId: string; evidence: string },
) {
  assert(command.actor.role === 'Room Attendant', 'Only assigned attendants can complete cleaning.');
  const next = begin(state, command);
  const plan = currentPlan(next);
  assert(plan.status === 'executing', 'Executing turnover plan is required.');
  const target = room(next, command.roomId);
  assert(target.status === 'assigned' || target.status === 'rework', 'Assigned or rework room is required.');
  assert(target.attendant === command.actor.id, 'Only the assigned attendant can complete this room.');
  assert(command.evidence.trim().length >= 20, 'Cleaning evidence must contain at least 20 characters.');
  assert(plan.roomVersions[target.id] === target.version, 'Room changed while cleaning was in progress.');
  target.status = 'cleaned';
  target.evidence = command.evidence.trim();
  delete target.defect;
  target.version += 1;
  plan.roomVersions[target.id] = target.version;
  if (next.rooms.every((item) => item.status === 'cleaned' || item.status === 'inspected')) plan.status = 'inspection';
  return finish(next, command, 'turnover-room-cleaned', target.id);
}

export function inspectTurnoverRoom(
  state: TurnoverPlanningState,
  command: CommandMeta & { roomId: string; passed: boolean; defect?: string },
) {
  assert(command.actor.role === 'Inspector', 'Only room inspectors can record inspections.');
  const next = begin(state, command);
  const plan = currentPlan(next);
  assert(['executing', 'inspection'].includes(plan.status), 'Active turnover inspection is required.');
  const target = room(next, command.roomId);
  assert(target.status === 'cleaned' && target.evidence, 'Completed cleaning evidence is required.');
  assert(command.actor.id !== target.attendant, 'Room inspection must be independent.');
  assert(plan.roomVersions[target.id] === target.version, 'Room changed before inspection.');
  if (command.passed) {
    target.status = 'inspected';
    delete target.defect;
  } else {
    const defect = command.defect;
    assert(defect && defect.trim().length >= 12, 'Failed inspection requires a clear defect.');
    target.status = 'rework';
    target.defect = defect.trim();
  }
  target.version += 1;
  plan.roomVersions[target.id] = target.version;
  plan.status = next.rooms.every((item) => item.status === 'inspected') ? 'inspection' : 'executing';
  return finish(next, command, command.passed ? 'turnover-room-inspected' : 'turnover-room-rework-required', target.id);
}

export function releaseTurnoverInventory(state: TurnoverPlanningState, command: CommandMeta) {
  assert(command.actor.role === 'Front Desk', 'Only front desk can release sellable rooms.');
  const next = begin(state, command);
  const plan = currentPlan(next);
  assert(plan.status === 'inspection', 'Completed inspection stage is required.');
  assert(next.rooms.every((item) => item.status === 'inspected'), 'Every turnover room must pass inspection.');
  assertPlanVersions(next);
  for (const target of next.rooms) {
    target.status = 'sellable';
    target.version += 1;
    plan.roomVersions[target.id] = target.version;
  }
  next.staff.reservedMinutes = 0;
  next.staff.version += 1;
  next.linen.availableSets -= next.linen.reservedSets;
  next.linen.reservedSets = 0;
  next.linen.version += 1;
  plan.staffVersion = next.staff.version;
  plan.linenVersion = next.linen.version;
  plan.status = 'released';
  plan.releasedBy = command.actor.id;
  return finish(next, command, 'turnover-inventory-released', `${String(next.rooms.length)} rooms`);
}

export class TurnoverPlanningRepository {
  static key = 'staypilot:turnover-planning:v1';
  private storage: Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage; }
  read() {
    const raw = this.storage.getItem(TurnoverPlanningRepository.key);
    return raw ? JSON.parse(raw) as TurnoverPlanningState : structuredClone(initialTurnoverPlanningState);
  }
  commit(expectedRevision: number, operation: (state: TurnoverPlanningState) => TurnoverPlanningState) {
    const current = this.read();
    assert(current.revision === expectedRevision, 'Another session changed turnover planning. Refresh before retrying.');
    const next = operation(current);
    this.storage.setItem(TurnoverPlanningRepository.key, JSON.stringify(next));
    return next;
  }
}
