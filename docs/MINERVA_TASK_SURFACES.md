# StayPilot Minerva task surfaces

This catalog identifies legitimate future **Write** task directions. It does not claim that the application currently contains these defects. A **Fix** candidate must begin with a real reproducible regression from repository history; never introduce a defect to manufacture a task.

## Candidate directions

| # | Domain surface | Observable outcome | Existing integration seam |
|---:|---|---|---|
| 1 | room allocation | Add a focused interaction that preserves the current record and exposes one visible outcome. | Operations route and its existing domain module |
| 2 | arrival queues | Add a focused interaction that preserves the current record and exposes one visible outcome. | Operations route and its existing domain module |
| 3 | housekeeping tasks | Add a focused interaction that preserves the current record and exposes one visible outcome. | Operations route and its existing domain module |
| 4 | overbooking controls | Add a focused interaction that preserves the current record and exposes one visible outcome. | Operations route and its existing domain module |
| 5 | rate plans | Add a focused interaction that preserves the current record and exposes one visible outcome. | Operations route and its existing domain module |
| 6 | folio settlement | Add a focused interaction that preserves the current record and exposes one visible outcome. | Operations route and its existing domain module |
| 7 | Saved operational views | A user can save, restore, rename, and remove one filter view without changing another user's preferences. | src/preferences, workspace filters, Settings |
| 8 | Bulk selection | Selection survives filtering and only drops records that no longer exist. | src/interaction/selection-model.ts, Operations |
| 9 | Entity-scoped drafts | Switching records preserves each unsaved draft and discard affects only the active record. | src/interaction/draft-registry.ts, edit dialog |
| 10 | Undo and redo | Users can reverse and replay a bounded sequence of local workspace edits. | src/interaction/history-stack.ts, command coordinator |
| 11 | Import preview | Backup validation shows record counts before an authorized restore changes persisted state. | src/interaction/import-preview.ts, Data tools |
| 12 | Async result ownership | A delayed result remains attached to its originating record after navigation. | src/interaction/feedback-ownership.ts, routed details |
| 13 | Revision conflict recovery | A stale editor can reload the latest revision while retaining changed fields for a retry. | repository revision guard, edit dialog |
| 14 | Accessible data navigation | Keyboard users can reach and scroll wide tables with a clear accessible name. | src/components/DataTable.tsx, Reports |
| 15 | Audit filtering | A user can narrow history by actor, action, entity, and date without changing source records. | Audit route and selectors |
| 16 | Notification preferences | Email and in-app preferences remain scoped to the current user and survive reload. | src/preferences/repository.ts, Inbox, Settings |
| 17 | Safe CSV export | Exported cells that begin with spreadsheet formulas remain inert while quotes and newlines round-trip. | reporting CSV and workspace export |
| 18 | Cross-tab synchronization | A storage update refreshes the owning workspace without replacing an active local draft. | storage listener, draft registry, repository |

| 19 | Comment mentions | Mention recipients are deduplicated and remain correct when text is edited around the cursor. | capabilities/comments and an existing detail page |
| 20 | Comment lifecycle | Authors can edit or delete their own comment while audit history retains a tombstone. | capabilities/comments/thread.ts and detail history |
| 21 | Attachment policy | Invalid name, size, type, extension, and duplicate cases produce specific visible feedback. | capabilities/attachments and an existing editor |
| 22 | Activity explorer | Actor, action, entity, date, and text filters combine without mutating history. | capabilities/activity and audit or history pages |
| 23 | Approval delegation | Effective approvers respect date ranges, revocation, overlap, and deny self-delegation. | capabilities/approvals and approval workflows |
| 24 | Recurring schedules | Daily and weekly rules expand deterministically across month boundaries with bounded counts. | capabilities/scheduling and planning workflows |
| 25 | Webhook delivery | Transient failures requeue with attempt state while successful delivery remains terminal and idempotent. | capabilities/webhooks and integration status |
| 26 | Import field mapping | Header mappings trim values, preserve row ownership, and report required-field errors before commit. | capabilities/imports and Data tools |
| 27 | Access matrix | Explicit deny rules override broad allows and the UI lists only effective actions. | capabilities/access and role-gated commands |
| 28 | Bulk workflow plan | A preview separates eligible records from skipped records before any command executes. | capabilities/workflows and Operations |
| 29 | Structured search | Field filters, quoted phrases, free text, and negation combine into one stable query. | capabilities/search and list filters |
| 30 | Cursor pagination | Stable cursors continue after the exact record and reject stale or malformed positions. | capabilities/pagination and long record lists |

## Candidate selection rules

Choose one trigger and one observable outcome. Prove the exact baseline behavior before editing. Prefer a small existing-source patch, keep unrelated refactors out, validate focused and full gates under Node 20.19.5, and keep local proof separate from external Minerva acceptance.
