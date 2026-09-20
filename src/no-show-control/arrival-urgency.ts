export interface UpcomingArrivalRecord {
  reservationId: string
  guestName: string
  expectedAt: string
  roomReadyBy: string
  roomStatus: 'ready' | 'blocked'
  replacementAvailable: boolean
  folioBlocker: boolean
  operationalOwner: string
  interventionOpenedAt: string | null
}

export interface ArrivalUrgencyStatus extends UpcomingArrivalRecord {
  minutesToArrival: number
  urgency: 'critical' | 'at-risk' | 'ready'
  blockers: string[]
  interventionAgeMinutes: number
  nextAction: string
}

export const seededUpcomingArrivals: UpcomingArrivalRecord[] = [
  { reservationId: 'RES-5812', guestName: 'Nora Hassan', expectedAt: '2026-10-20T15:00:00Z', roomReadyBy: '2026-10-20T14:00:00Z', roomStatus: 'blocked', replacementAvailable: false, folioBlocker: true, operationalOwner: 'Guest recovery', interventionOpenedAt: '2026-10-20T12:30:00Z' },
  { reservationId: 'RES-5820', guestName: 'Luca Moretti', expectedAt: '2026-10-20T18:00:00Z', roomReadyBy: '2026-10-20T16:30:00Z', roomStatus: 'blocked', replacementAvailable: true, folioBlocker: false, operationalOwner: 'Rooms control', interventionOpenedAt: '2026-10-20T13:15:00Z' },
  { reservationId: 'RES-5824', guestName: 'Maya Singh', expectedAt: '2026-10-20T16:00:00Z', roomReadyBy: '2026-10-20T14:30:00Z', roomStatus: 'ready', replacementAvailable: false, folioBlocker: false, operationalOwner: 'Front desk', interventionOpenedAt: null },
]

export function arrivalUrgencyWorkload(
  records: UpcomingArrivalRecord[],
  asOf: string,
): ArrivalUrgencyStatus[] {
  const now = Date.parse(asOf)
  const rank = { critical: 0, 'at-risk': 1, ready: 2 } as const
  return records
    .map((record) => {
      const minutesToArrival = Math.round((Date.parse(record.expectedAt) - now) / 60_000)
      const blockers = [
        ...(record.roomStatus === 'blocked' && !record.replacementAvailable ? ['No arrival-ready room'] : []),
        ...(record.folioBlocker ? ['Folio clearance required'] : []),
      ]
      const urgency = blockers.length === 0
        ? 'ready'
        : minutesToArrival <= 90
          ? 'critical'
          : 'at-risk'
      const interventionAgeMinutes = record.interventionOpenedAt === null
        ? 0
        : Math.max(0, Math.round((now - Date.parse(record.interventionOpenedAt)) / 60_000))
      const nextAction = record.folioBlocker
        ? 'Clear folio before arrival'
        : record.roomStatus === 'blocked' && record.replacementAvailable
          ? 'Confirm replacement room'
          : blockers.length > 0
            ? 'Escalate room recovery'
            : 'Maintain arrival assignment'
      return { ...record, minutesToArrival, urgency, blockers, interventionAgeMinutes, nextAction } satisfies ArrivalUrgencyStatus
    })
    .sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.minutesToArrival - b.minutesToArrival)
}
