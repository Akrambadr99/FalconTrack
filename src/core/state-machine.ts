export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;
export function canTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): boolean { return map[from].includes(to); }
export function transition<S extends string, T extends {
    status: S;
    revision: number;
}>(map: TransitionMap<S>, record: T, to: S): T {
    if (!canTransition(map, record.status, to))
        throw new Error('Invalid transition from ' + record.status + ' to ' + to + '.');
    return { ...record, status: to, revision: record.revision + 1 };
}
export function terminalStates<S extends string>(map: TransitionMap<S>): S[] { return (Object.keys(map) as S[]).filter(state => map[state].length === 0); }
