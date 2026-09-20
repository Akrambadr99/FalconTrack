import { describe, expect, it } from 'vitest'
import { arrivalUrgencyWorkload, seededUpcomingArrivals } from './arrival-urgency'

describe('arrival urgency workload', () => {
  it('prioritizes the nearest guest-facing failure with its operational blockers', () => {
    const workload = arrivalUrgencyWorkload(seededUpcomingArrivals, '2026-10-20T14:00:00Z')
    expect(workload[0]).toMatchObject({
      reservationId: 'RES-5812',
      urgency: 'critical',
      minutesToArrival: 60,
      blockers: ['No arrival-ready room', 'Folio clearance required'],
      interventionAgeMinutes: 90,
    })
  })

  it('keeps a ready arrival clear of recovery work', () => {
    const ready = arrivalUrgencyWorkload([seededUpcomingArrivals[2]!], '2026-10-20T14:00:00Z')[0]
    expect(ready).toMatchObject({ urgency: 'ready', blockers: [], nextAction: 'Maintain arrival assignment' })
  })
})
