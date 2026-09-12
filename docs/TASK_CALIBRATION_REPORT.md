# StayPilot task calibration report

StayPilot's medium-depth surfaces come from date overlap, room readiness, guest state, folio settlement, and housekeeping handoffs. The new allocation preview combines the selected stay, selected room, room status, and other reservations.

| Workflow group | Why it is medium | React/state concepts | Hidden-test determinism | Likely future patch |
|---|---|---|---|---|
| Room allocation | Two selections, date ranges, room state, and competing stays interact | memoized validation, keyed selection | High | 1–3 existing files |
| Arrival and folio | Pending check-in and payment affect related records | optimistic updates, rollback, ownership | High | 2–4 files |
| Housekeeping | Task ordering, recurrence, and room transitions combine | reducers, schedules, permissions | High with fixed clock | 2–4 files |
| Exceptions and reporting | Overbooking, attachments, and export need safe recovery | conflicts, parsing, derived output | High | 1–4 files |

## Calibration

- **Medium majority:** room allocation preview; overlap plus readiness reasons; stale room selection; filtered arrival selection; delayed check-in ownership; optimistic folio rollback; partial bulk arrival plan; reservation conflict retry; housekeeping recurrence edits; actor change during inspection; room-scoped task drafts; overbooking activity filters; evidence upload validation; safe folio export; cursor paging of stays; structured guest search; comment mentions; notification snooze; webhook retry; cross-tab refresh preserving allocation choices.
- **Reject as Too Easy:** change a room label; recolor Ready; hide one action; validate one empty field.
- **Reject as Too Hard:** replace the booking engine; migrate every reservation; build channel management; coordinate multiple external payment and property systems.

The 20 Medium directions above use fixed rooms, stays, dates, tasks, actors, and folios and usually require 1–4 existing files.
