import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { GovernancePage } from './GovernancePage'
import { AppProviders } from '../providers/AppProviders'
import { createAtlasQueryClient } from '../query-client'
import { createAppServices } from '../services'
import { createAtlasFixtures, FixedClock } from '../../data'
import { isoDateTime, type UserId } from '../../domain'
import { render, screen } from '../../test/render'

function renderGovernance(actorId?: UserId, initialEntry = '/governance') {
  const services = createAppServices({
    ...(actorId ? { actorId } : {}),
    clock: new FixedClock(isoDateTime('2026-02-10T12:00:00.000Z')),
  })
  render(
    <AppProviders queryClient={createAtlasQueryClient()} services={services}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <GovernancePage />
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('GovernancePage', () => {
  it('renders and filters authoritative audit outcomes', async () => {
    const user = userEvent.setup()
    renderGovernance()
    expect(screen.getByRole('status')).toHaveTextContent('Loading governance report')
    expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeVisible()
    expect(
      screen.getByRole('table', { name: 'Authoritative workspace audit events' }),
    ).toHaveTextContent('fixture-bootstrap-001')

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Outcome' }),
      'rejected',
    )
    expect(await screen.findByText('1 matching events')).toBeVisible()
    expect(screen.getByRole('table')).toHaveTextContent('fixture-access-check-001')
    expect(screen.getByRole('table')).not.toHaveTextContent('fixture-bootstrap-001')
  })

  it('fails closed when the active role lacks audit access', async () => {
    const fixtures = createAtlasFixtures()
    const viewerId = fixtures.memberships.find(({ role }) => role === 'viewer')?.userId
    if (!viewerId) throw new Error('Expected a fixture viewer.')

    renderGovernance(viewerId)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Governance access is restricted',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('filters actors and correlation IDs with exportable deep links', async () => {
    const user = userEvent.setup()
    renderGovernance()
    await screen.findByRole('heading', { name: 'Audit log' })

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Actor' }),
      'system',
    )
    expect(await screen.findByText('1 matching events')).toBeVisible()
    const table = screen.getByRole('table', {
      name: 'Authoritative workspace audit events',
    })
    expect(table).toHaveTextContent('fixtures.created')
    const deepLink = screen.getByRole('link', { name: 'fixture-bootstrap-001' })
    await user.click(deepLink)
    expect(
      await screen.findByRole('textbox', { name: 'Request or correlation ID' }),
    ).toHaveValue('fixture-bootstrap-001')

    const exportLink = screen.getByRole('link', { name: 'Export this page' })
    expect(exportLink).toHaveAttribute('download', 'sprintia-audit-page-1.csv')
    expect(decodeURIComponent(exportLink.getAttribute('href') ?? '')).toContain(
      '"occurredAt","action","actor","outcome","entityId","requestId"',
    )
  })

  it('applies date filters and recovers stale pagination links', async () => {
    const user = userEvent.setup()
    renderGovernance(undefined, '/governance?page=99')
    expect(await screen.findByText('Page 1 of 1')).toBeVisible()

    await user.type(screen.getByLabelText('From date'), '2026-02-02')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(
      await screen.findByText('No audit events match these filters.'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('4 matching events')).toBeVisible()
  })

  it('ignores non-canonical date values from shared URLs', async () => {
    renderGovernance(undefined, '/governance?from=2026-02-31')

    expect(await screen.findByText('4 matching events')).toBeVisible()
    expect(screen.getByLabelText('From date')).toHaveValue('')
  })
})
