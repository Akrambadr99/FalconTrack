import { useEffect, type ChangeEvent, type SyntheticEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { GovernanceExportRow } from '../../data'
import { isoDateTime, userId, type AuditEvent, type UserId } from '../../domain'
import { useGovernanceReport } from '../../features/governance/governance-queries'
import { hasAppErrorKind } from '../errors/classify-app-error'
import { useAppServices } from '../providers/app-services-context'
import './pages.css'

const outcomes = ['succeeded', 'rejected', 'failed'] as const satisfies readonly AuditEvent['outcome'][]

export function GovernancePage() {
  const { workspaceId } = useAppServices()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePage(searchParams.get('page'))
  const outcome = parseOutcome(searchParams.get('outcome'))
  const actionValue = searchParams.get('action')
  const action = actionValue === null || actionValue === '' ? undefined : actionValue
  const actor = parseActor(searchParams.get('actor'))
  const entityId = optionalParameter(searchParams.get('entity'))
  const requestId = optionalParameter(searchParams.get('request'))
  const from = parseDate(searchParams.get('from'))
  const to = parseDate(searchParams.get('to'))
  const report = useGovernanceReport({
    workspaceId,
    page: { number: page, size: 10 },
    ...(outcome ? { outcome } : {}),
    ...(action ? { action } : {}),
    ...(actor ? { actor } : {}),
    ...(entityId ? { entityId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(from ? { occurredFrom: dateBoundary(from, false) } : {}),
    ...(to ? { occurredTo: dateBoundary(to, true) } : {}),
  })

  useEffect(() => {
    if (!report.data) return
    const lastPage = Math.max(report.data.events.pageCount, 1)
    if (page <= lastPage) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (lastPage === 1) next.delete('page')
      else next.set('page', String(lastPage))
      return next
    })
  }, [page, report.data, setSearchParams])

  const setFilter = (key: string, value: string): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page')
      return next
    })
  }

  const setSubmittedFilters = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      for (const key of ['entity', 'request', 'from', 'to']) {
        const value = formValue(form, key)
        if (value) next.set(key, value)
        else next.delete(key)
      }
      next.delete('page')
      return next
    })
  }

  const setPage = (nextPage: number): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (nextPage > 1) next.set('page', String(nextPage))
      else next.delete('page')
      return next
    })
  }

  if (report.isPending) {
    return (
      <section className="page" aria-labelledby="governance-title" aria-busy="true">
        <GovernanceHeader />
        <div className="dashboard-state" role="status">Loading governance report…</div>
      </section>
    )
  }

  if (report.isError) {
    const forbidden = hasAppErrorKind(report.error, 'forbidden')
    return (
      <section className="page" aria-labelledby="governance-title">
        <GovernanceHeader />
        <div className="dashboard-state dashboard-state--error" role="alert">
          <h2>{forbidden ? 'Governance access is restricted' : 'Governance report unavailable'}</h2>
          <p>
            {forbidden
              ? 'Only workspace owners and administrators can review authoritative audit data.'
              : 'The audit request did not complete.'}
          </p>
          {!forbidden ? (
            <button className="secondary-button" type="button" onClick={() => void report.refetch()}>
              Retry governance report
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section className="page" aria-labelledby="governance-title">
      <GovernanceHeader />
      <p className="analytics-generated">
        Authoritative snapshot generated{' '}
        <time dateTime={report.data.generatedAt}>{formatTimestamp(report.data.generatedAt)}</time>
      </p>

      <dl className="metric-grid" aria-label="Audit outcomes">
        <Metric label="All events" value={report.data.totalEvents} />
        <Metric label="Succeeded" value={report.data.succeededEvents} />
        <Metric label="Rejected or failed" value={report.data.rejectedEvents + report.data.failedEvents} />
      </dl>

      <form
        className="governance-filters governance-filters--advanced"
        aria-label="Audit log filters"
        onSubmit={setSubmittedFilters}
      >
        <label>
          <span>Outcome</span>
          <select
            value={outcome ?? ''}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setFilter('outcome', event.currentTarget.value)
            }}
          >
            <option value="">All outcomes</option>
            {outcomes.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}
          </select>
        </label>
        <label>
          <span>Action</span>
          <select
            value={action ?? ''}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setFilter('action', event.currentTarget.value)
            }}
          >
            <option value="">All actions</option>
            {report.data.actions.map(({ value, count }) => (
              <option key={value} value={value}>{value} ({count})</option>
            ))}
          </select>
        </label>
        <label>
          <span>Actor</span>
          <select
            value={actor ?? ''}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setFilter('actor', event.currentTarget.value)
            }}
          >
            <option value="">All actors</option>
            {report.data.actors.map(({ value, label, count }) => (
              <option key={value} value={value}>{label} ({count})</option>
            ))}
          </select>
        </label>
        <FilterInput label="Entity ID" name="entity" defaultValue={entityId ?? ''} />
        <FilterInput
          label="Request or correlation ID"
          name="request"
          defaultValue={requestId ?? ''}
        />
        <FilterInput label="From date" name="from" type="date" defaultValue={from ?? ''} />
        <FilterInput label="To date" name="to" type="date" defaultValue={to ?? ''} />
        <div className="governance-filter-actions">
          <button className="secondary-button" type="submit">Apply filters</button>
          <button
            className="text-button"
            type="button"
            onClick={() => { setSearchParams({}) }}
          >
            Clear filters
          </button>
        </div>
      </form>

      <section className="work-panel" aria-labelledby="audit-log-title">
        <div className="work-panel__header">
          <div>
            <p className="page-eyebrow">Protected operations record</p>
            <h2 id="audit-log-title">Audit log</h2>
          </div>
          <div className="governance-export">
            <span>{report.data.events.totalItems} matching events</span>
            <a
              className="secondary-button"
              download={`sprintia-audit-page-${String(page)}.csv`}
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(governanceCsv(report.data.exportRows))}`}
            >
              Export this page
            </a>
          </div>
        </div>
        {report.data.events.items.length === 0 ? (
          <div className="empty-panel"><p>No audit events match these filters.</p></div>
        ) : (
          <div className="analytics-table-scroll">
            <table className="analytics-table governance-table">
              <caption className="visually-hidden">Authoritative workspace audit events</caption>
              <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Entity</th><th scope="col">Outcome</th><th scope="col">Request</th></tr></thead>
              <tbody>
                {report.data.events.items.map(({ event, actorName, entityId: eventEntityId }) => (
                  <tr key={event.id}>
                    <td><time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time></td>
                    <th scope="row">{event.action}</th>
                    <td>{actorName}</td>
                    <td><code>{eventEntityId ?? '—'}</code></td>
                    <td><span className={`governance-outcome governance-outcome--${event.outcome}`}>{formatLabel(event.outcome)}</span></td>
                    <td>
                      <Link
                        className="governance-request-link"
                        to={{ search: requestDeepLink(searchParams, event.requestId) }}
                      >
                        <code>{event.requestId}</code>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav className="governance-pagination" aria-label="Audit log pages">
          <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => { setPage(page - 1) }}>Previous</button>
          <span>Page {page} of {Math.max(report.data.events.pageCount, 1)}</span>
          <button className="secondary-button" type="button" disabled={page >= report.data.events.pageCount} onClick={() => { setPage(page + 1) }}>Next</button>
        </nav>
      </section>
    </section>
  )
}

function GovernanceHeader() {
  return <header className="page-header"><p className="page-eyebrow">Workspace governance</p><h1 id="governance-title">Governance</h1><p>Review permission-protected operational evidence and request outcomes.</p></header>
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return <div className="metric-card"><dt>{label}</dt><dd>{value}</dd></div>
}

function FilterInput({
  label,
  name,
  defaultValue,
  type = 'text',
}: Readonly<{
  label: string
  name: string
  defaultValue: string
  type?: string
}>) {
  return (
    <label>
      <span>{label}</span>
      <input
        key={defaultValue}
        name={name}
        type={type}
        defaultValue={defaultValue}
        maxLength={type === 'text' ? 200 : undefined}
      />
    </label>
  )
}

function parsePage(value: string | null): number {
  const parsed = Number(value ?? '1')
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function parseOutcome(value: string | null): AuditEvent['outcome'] | undefined {
  return outcomes.find((candidate) => candidate === value)
}

function optionalParameter(value: string | null): string | undefined {
  return value === null || value === '' ? undefined : value.slice(0, 200)
}

function parseActor(value: string | null): UserId | 'system' | undefined {
  if (!value) return undefined
  if (value === 'system') return value
  try {
    return userId(value)
  } catch {
    return undefined
  }
}

function parseDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined
}

function dateBoundary(value: string, end: boolean) {
  return isoDateTime(
    `${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`,
  )
}

function formValue(form: FormData, key: string): string | null {
  const value = form.get(key)
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 200)
    : null
}

function requestDeepLink(current: URLSearchParams, requestId: string): string {
  const next = new URLSearchParams(current)
  next.set('request', requestId)
  next.delete('page')
  return `?${next.toString()}`
}

function formatLabel(value: string): string {
  return value.replaceAll('-', ' ').replace(/^./, (character) => character.toUpperCase())
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))
}

function governanceCsv(rows: readonly GovernanceExportRow[]): string {
  const values = [
    ['occurredAt', 'action', 'actor', 'outcome', 'entityId', 'requestId'],
    ...rows.map((row) => [
      row.occurredAt,
      row.action,
      row.actor,
      row.outcome,
      row.entityId,
      row.requestId,
    ]),
  ]
  return values.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
