# StayPilot taskability audit

## Audit

Allocation combines stay selection, room selection, readiness, overlap, and refreshed inventory. Arrival/folio work combines pending actions, related records, and rollback. Housekeeping combines schedules, roles, and room transitions. Exceptions add conflicts, attachments, and reporting. Fixed rooms, stays, dates, actors, and folios support 1–4-file tasks. Cosmetic room cards are weak; replacing booking or channel management is too broad.

## 30 classified directions

**Strong candidate · Medium/Medium-Hard (18):** 1 allocation preview; 2 combined overlap/readiness reasons; 3 stale room selection; 4 refreshed inventory eligibility; 5 filtered arrival selection; 6 delayed check-in ownership; 7 optimistic folio rollback; 8 partial bulk arrival plan; 9 reservation conflict retry; 10 housekeeping recurrence edits; 11 actor change during inspection; 12 room-scoped task drafts; 13 overbooking activity filters; 14 evidence upload validation; 15 safe folio export; 16 stay cursor recovery; 17 structured guest search; 18 cross-tab refresh preserving choices.

**Medium (5):** 19 comment mentions; 20 notification snooze; 21 webhook retry; 22 archived room blocks; 23 empty arrival page recovery.

**Poor hidden-test candidate (2):** 24 payment-terminal timing; 25 native folio printing.

**Too Easy (2):** 26 rename Ready; 27 recolor a room badge.

**Too Hard (3):** 28 replace booking; 29 migrate every reservation; 30 coordinate channel managers and payment systems.

Strong count: **18**, with deterministic date, ownership, transition, and conflict behavior.

## Depth expansion directions 31–40

31. **Strong candidate · Medium-Hard:** checkout combines stay state, settled folio, balance, and room occupancy. 32. **Strong candidate · Medium:** stay switching recomputes balance and blockers. 33. **Strong candidate · Medium-Hard:** a late charge revokes checkout readiness. 34. **Strong candidate · Medium:** equal charges/payments derive zero outstanding balance. 35. **Strong candidate · Medium-Hard:** room move updates checkout ownership without losing folio state. 36. **Strong candidate · Medium:** settled status and numeric balance failures remain distinct. 37. **Strong candidate · Medium-Hard:** early checkout recalculates charges before readiness. 38. **Strong candidate · Medium:** cancelled stays never appear ready for checkout. 39. **Too Easy:** rename Outstanding folio. 40. **Too Hard:** coordinate checkout with live payment and channel systems.

Expanded strong count: **26**.

## Strongest 15 candidates

Directions **1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 18, 31, 33, 35, and 37** are the final shortlist. Their React judgment is respectively: room/stay dependent selection; combined overlap/readiness reasons; stale room recovery; refreshed availability; asynchronous check-in ownership; optimistic folio rollback; partial arrival planning; reservation conflict recovery; immutable recurrence editing; actor change during active inspection; cross-tab choice reconciliation; stay/folio/room derivation; late-charge revocation; room-move ownership; and early-checkout recalculation before readiness.

## Room move directions 41–50

41. **Strong candidate · Medium-Hard:** room move combines in-house status, destination state, date, stays, and maintenance. 42. **Strong candidate · Medium:** destination changes preserve stay and effective date. 43. **Strong candidate · Medium-Hard:** a late maintenance block revokes a staged move. 44. **Strong candidate · Medium:** the current room cannot be selected as destination. 45. **Strong candidate · Medium-Hard:** overlapping reservations block only the affected destination. 46. **Strong candidate · Medium:** move date boundaries follow arrival and departure precisely. 47. **Strong candidate · Medium-Hard:** room-status refresh updates readiness without losing the move draft. 48. **Strong candidate · Medium:** cancelled and checked-out stays do not block availability. 49. **Too Easy:** rename Destination room. 50. **Too Hard:** synchronize the move with live channel managers.

Current strong count: **34**. Revised strongest 15: **1, 2, 3, 4, 6, 7, 8, 9, 18, 31, 33, 35, 37, 41, and 43**.
