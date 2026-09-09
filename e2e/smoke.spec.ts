import { expect, test } from '@playwright/test'

test('loads the shell and navigates with accessible controls', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('FalconTrack')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dashboard' }),
  ).toBeVisible()
  await expect(page.getByText('Tracked issues')).toBeVisible()
  await expect(page.getByText('5 of 6 issues')).toBeVisible()

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()

  const launchPriority = page.getByRole('combobox', {
    name: 'Priority for Publish the launch readiness brief',
  })
  await launchPriority.selectOption('low')
  await expect(
    page.getByText('Priority updated for Publish the launch readiness brief.'),
  ).toBeVisible()
  await expect(launchPriority).toHaveValue('low')

  await page.getByRole('link', { name: 'Projects' }).click()
  await expect(page).toHaveURL('/projects')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Projects' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Field reliability' }),
  ).toBeVisible()
  const fieldReliability = page.getByRole('article').filter({
    has: page.getByRole('heading', { level: 2, name: 'Field reliability' }),
  })
  await expect(fieldReliability.getByText('Total').locator('..')).toContainText('3')

  await page.getByRole('link', { name: 'Field reliability' }).click()
  await expect(page).toHaveURL(/\/projects\/prj_/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Field reliability' }),
  ).toBeVisible()
  await expect(page.getByText('Close the device telemetry coverage gap')).toBeVisible()

  await page.getByRole('link', { name: 'Issues' }).click()
  await expect(page).toHaveURL('/issues')
  await expect(page.getByRole('table', { name: 'Workspace issues' })).toBeVisible()
  await expect(page.getByText('6 matching issues')).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search issues' }).fill('restart')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL('/issues?q=restart')
  await expect(page.getByText('Review intermittent restart incidents')).toBeVisible()

  await page
    .getByRole('checkbox', { name: 'Select Review intermittent restart incidents' })
    .check()
  await page.getByLabel('Set priority').selectOption('urgent')
  await page.getByRole('button', { name: 'Apply priority' }).click()
  await expect(page.getByText('1 issue updated.')).toBeVisible()

  await page.getByRole('link', { name: 'Review intermittent restart incidents' }).click()
  await expect(page).toHaveURL(/\/issues\/issue_/)
  await page.getByRole('button', { name: 'Edit issue' }).click()
  await page.getByLabel('Title').fill('Review restart incident clusters')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Review restart incident clusters' }),
  ).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Edit issue' })).not.toBeVisible()
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '')

  const watchIssue = page.getByRole('button', { name: 'Watch issue' })
  await expect(watchIssue).toHaveAttribute('aria-pressed', 'false')
  await watchIssue.click()
  await expect(page.getByText('You are now watching this issue.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop watching' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Stop watching' }).click()
  await expect(page.getByText('You stopped watching this issue.')).toBeVisible()

  const commentDraft = page.getByLabel('Add a comment')
  await commentDraft.fill('Confirmed incident owners and next steps.')
  await page
    .getByLabel('Member to mention')
    .selectOption({ label: 'Lena Ortiz (lena@example.test)' })
  await page.getByRole('button', { name: 'Insert mention' }).click()
  await expect(commentDraft).toHaveValue(
    'Confirmed incident owners and next steps. @Lena Ortiz ',
  )
  await page.getByRole('button', { name: 'Add comment' }).click()
  await expect(page.getByText('Comment added.')).toBeVisible()
  await expect(page.getByText('Confirmed incident owners and next steps.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop watching' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('filters the authoritative project portfolio with durable URL state', async ({
  page,
}) => {
  await page.goto('/projects')
  await expect(page.getByText('2 matching projects')).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search projects' }).fill('REL')
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL('/projects?q=REL')
  await expect(page.getByText('1 matching project')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Field reliability' })).toBeVisible()

  await page.getByLabel('Status').selectOption('planned')
  await expect(page).toHaveURL('/projects?q=REL&status=planned')
  await expect(page.getByText('No matching projects')).toBeVisible()
})

test('watches a project with accessible state and durable activity', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Launch readiness' }).click()
  const watchers = page.getByRole('region', { name: 'Project watchers' })
  await expect(watchers.getByText('1 watcher')).toBeVisible()
  await expect(
    watchers.getByRole('list', { name: 'People watching this project' }),
  ).toContainText('Maya Chen')

  const watch = watchers.getByRole('button', { name: 'Watch project' })
  await watch.click()
  const stop = watchers.getByRole('button', { name: 'Stop watching project' })
  await expect(stop).toHaveAttribute('aria-pressed', 'true')
  await expect(stop).toBeFocused()
  await expect(watchers.getByText('2 watchers')).toBeVisible()
  await expect(watchers.getByText('You are now watching this project.')).toBeVisible()
  await expect(page.getByText(/Omar Haddad Started watching this project\./)).toBeVisible()
})

test('creates a governed project foundation with an accessible workflow', async ({
  page,
}) => {
  await page.goto('/projects')
  await page.getByRole('button', { name: 'Create project' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create project' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused()

  await dialog.getByLabel('Name', { exact: true }).fill('Security readiness')
  await dialog.getByLabel('Key').fill('SEC')
  await dialog
    .getByLabel('Description')
    .fill('Coordinate security controls, evidence, and launch acceptance.')
  await dialog.getByLabel('Project lead').selectOption({ label: 'Maya Chen' })
  await dialog.getByLabel('Stage 2 name').fill('Verifying')
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect(page).toHaveURL(/\/projects\/prj_gateway_created_/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Security readiness' }),
  ).toBeVisible()
  await expect(page.getByText('SEC · planned')).toBeVisible()
  await expect(page.getByText(/Created SEC with 3 workflow stages\./)).toBeVisible()
})

test('governs project lifecycle changes and archival', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Launch readiness' }).click()
  await page.getByRole('button', { name: 'Edit project' }).click()
  await page.getByLabel('Name').fill('Launch assurance')
  await page.getByLabel('Status').selectOption('paused')
  await page.getByRole('button', { name: 'Save project' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Launch assurance' }),
  ).toBeVisible()
  await expect(page.getByText('OPS · paused')).toBeVisible()
  await expect(page.getByText(/Omar Haddad Updated OPS\./)).toBeVisible()

  await page.getByRole('button', { name: 'Archive project' }).click()
  const confirmation = page.getByRole('dialog')
  await expect(confirmation).toContainText('issues and comments become read-only')
  await confirmation.getByRole('button', { name: 'Archive project' }).click()
  await expect(
    page.getByText(
      'This project is archived. Its issues and comments are read-only.',
    ),
  ).toBeVisible()
  await expect(page.getByText(/Omar Haddad Archived OPS\./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit project' })).toHaveCount(0)
})

test('transfers project leadership with authoritative role reconciliation', async ({
  page,
}) => {
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Launch readiness' }).click()
  const trigger = page.getByRole('button', { name: 'Transfer lead' })
  await trigger.click()
  const dialog = page.getByRole('dialog', {
    name: 'Transfer project leadership',
  })
  await expect(dialog.getByLabel('New project lead')).toHaveValue(
    /usr_.*product_lead/,
  )
  await dialog.getByLabel('Former lead’s new role').selectOption('viewer')
  await dialog.getByRole('button', { name: 'Transfer leadership' }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('Maya Chen is now the project lead.')).toBeVisible()
  const members = page.getByRole('table', {
    name: 'Project membership administration',
  })
  await expect(members.getByRole('row', { name: /Maya Chen/ })).toContainText('Lead')
  await expect(members.getByRole('row', { name: /Omar Haddad/ })).toContainText('Viewer')
  await expect(
    page.getByRole('heading', { name: 'Project activity' }).locator('xpath=ancestor::section[1]'),
  ).toContainText('Transferred leadership from Omar Haddad to Maya Chen')
})

test('governs project membership and assigned-work reassignment', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Launch readiness' }).click()
  const members = page.getByRole('table', {
    name: 'Project membership administration',
  })
  await expect(members).toBeVisible()

  await page.getByRole('button', { name: 'Add member' }).click()
  let dialog = page.getByRole('dialog', { name: 'Add project member' })
  await dialog.getByLabel('Member').selectOption({
    label: 'Theo Martin · theo@example.test',
  })
  await dialog.getByLabel('Project role').selectOption('viewer')
  await dialog.getByRole('button', { name: 'Add member' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(members.getByRole('row', { name: /Theo Martin/ })).toContainText(
    'Viewer',
  )

  await members.getByRole('button', { name: 'Manage Maya Chen' }).click()
  dialog = page.getByRole('dialog', { name: 'Manage Maya Chen' })
  await dialog.getByRole('button', { name: 'Remove from project' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Remove Maya Chen?' })
  await expect(confirmation.getByLabel('Reassign 1 assigned issue to')).toHaveValue(
    /usr_.*operations_lead/,
  )
  const remove = confirmation.getByRole('button', { name: 'Remove member' })
  await expect(remove).toBeFocused()
  await remove.click()
  await expect(confirmation).not.toBeVisible()
  await expect(members.getByRole('row', { name: /Maya Chen/ })).not.toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Project activity' }).locator('xpath=ancestor::section[1]'),
  ).toContainText('Removed Maya Chen and reassigned 1 issue')
})

test('evolves a project workflow without orphaning active work', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Launch readiness' }).click()
  const workflow = page.getByRole('table', {
    name: 'Project workflow administration',
  })
  await expect(workflow).toBeVisible()

  await page.getByRole('button', { name: 'Configure workflow' }).click()
  const dialog = page.getByRole('dialog', { name: 'Configure project workflow' })
  await dialog.getByLabel('Status 1 name').fill('Intake queue')
  await dialog.getByLabel('Status 1 category').selectOption('unstarted')
  await dialog.getByRole('button', { name: 'Move In progress up' }).click()
  await dialog.getByRole('button', { name: 'Add status' }).click()
  await dialog.getByLabel('Status 4 name').fill('Verified')
  await dialog.getByLabel('Status 4 category').selectOption('completed')
  await dialog.getByRole('button', { name: 'Retire Done' }).click()
  await expect(dialog.getByLabel('Move 1 issue from Done to')).toHaveValue(
    /status_.*launch_active/,
  )
  await dialog.getByRole('button', { name: 'Save workflow' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(workflow.getByRole('row').nth(1)).toContainText('In progress')
  await expect(workflow.getByRole('row').nth(2)).toContainText('Intake queue')
  await expect(workflow.getByRole('row').nth(3)).toContainText('Verified')

  await page.getByRole('link', { name: 'Board', exact: true }).click()
  await expect(page).toHaveURL(/\/board/)
  await expect(page.getByRole('heading', { level: 1, name: 'Board' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Project', exact: true })
    .selectOption({ label: 'Launch readiness' })
  await expect(page.getByRole('heading', { name: 'In progress' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Intake queue' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Verified' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Done' })).toHaveCount(0)
})

test('repairs a saved issue view after its workflow status is retired', async ({ page }) => {
  await page.goto('/issues')
  await expect(page.getByRole('table', { name: 'Workspace issues' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption({
    label: 'Launch readiness',
  })
  await page.getByLabel('Workflow status').selectOption({ label: 'Done' })
  await expect(page.getByText('1 matching issue')).toBeVisible()
  await page.getByLabel('View name').fill('Completed launch')
  await page.getByRole('button', { name: 'Save current view' }).click()
  await expect(
    page.getByText('Completed launch saved as a private view.'),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Projects' }).click()
  await page.getByRole('link', { name: 'Launch readiness' }).click()
  await page.getByRole('button', { name: 'Configure workflow' }).click()
  const dialog = page.getByRole('dialog', { name: 'Configure project workflow' })
  await dialog.getByRole('button', { name: 'Add status' }).click()
  await dialog.getByLabel('Status 4 name').fill('Verified')
  await dialog.getByLabel('Status 4 category').selectOption('completed')
  await dialog.getByRole('button', { name: 'Retire Done' }).click()
  await expect(dialog.getByLabel('Move 1 issue from Done to')).toHaveValue(
    /status_.*launch_backlog/,
  )
  await dialog.getByRole('button', { name: 'Save workflow' }).click()
  await expect(dialog).not.toBeVisible()

  await page.getByRole('link', { name: 'Issues' }).click()
  await expect(page.getByRole('table', { name: 'Workspace issues' })).toBeVisible()
  await page.getByLabel('Open saved view').selectOption({
    label: 'Completed launch',
  })

  await expect(
    page.getByText(
      'Completed launch applied. Unavailable workflow filters were removed and the saved view was updated.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(
    /prj_.*launch/,
  )
  await expect(page.getByLabel('Workflow status')).toHaveValue('')
  await expect(page).toHaveURL(/project=prj_.*launch/)
  await expect(page).not.toHaveURL(/status=/)
})

test('creates a permission-aware issue with workflow metadata', async ({ page }) => {
  await page.goto('/issues')
  await expect(page.getByRole('table', { name: 'Workspace issues' })).toBeVisible()

  await page.getByRole('button', { name: 'Create issue' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create issue' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Project').selectOption({ label: 'Launch readiness' })
  await dialog.getByLabel('Title').fill('Coordinate launch decision review')
  await dialog
    .getByLabel('Description')
    .fill('Confirm decisions, owners, and escalation paths.')
  await dialog.getByLabel('Type').selectOption('story')
  await dialog.getByLabel('Priority').selectOption('high')
  await dialog.getByLabel('Assignee').selectOption({ label: 'Omar Haddad' })
  await dialog.getByLabel('Due date').fill('2026-03-04')
  await dialog.getByLabel('Customer impact').check()
  await dialog.getByRole('button', { name: 'Create issue' }).click()

  await expect(page).toHaveURL(/\/issues\/issue_/)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Coordinate launch decision review',
    }),
  ).toBeVisible()
  await expect(page.getByText('High')).toBeVisible()
  await expect(page.getByText('Story')).toBeVisible()
  await expect(page.getByText('2026-03-04')).toBeVisible()
})

test('moves work across the accessible project board', async ({ page }) => {
  await page.goto('/board')

  await expect(page).toHaveURL(/\/board\?project=prj_/)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Board' }),
  ).toBeVisible()
  await expect(
    page.getByText(/use its status menu as a keyboard-accessible alternative/i),
  ).toBeVisible()

  const moveControl = page.getByRole('combobox', {
    name: 'Move Review intermittent restart incidents',
  })
  await expect(moveControl).toHaveValue(/status_/)
  await moveControl.selectOption({ label: 'Investigating' })

  await expect(
    page.getByText('Review intermittent restart incidents moved to Investigating.'),
  ).toBeVisible()
  await expect(moveControl).toHaveValue(/status_/)
  await page.getByRole('link', { name: 'Review intermittent restart incidents' }).click()
  await expect(page).toHaveURL(/\/issues\/issue_/)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Review intermittent restart incidents',
    }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Issue collaboration' })
      .getByRole('listitem')
      .filter({ hasText: 'Moved from Triage to Investigating.' }),
  ).toBeVisible()
})

test('moves board work with a pointer while preserving the keyboard alternative', async ({
  page,
}) => {
  await page.goto('/board')
  const issueTitle = 'Close the device telemetry coverage gap'
  const dragHandle = page.getByRole('button', { name: `Drag ${issueTitle}` })
  const targetColumn = page.locator('section.kanban-column').filter({
    has: page.getByRole('heading', { level: 2, name: 'Resolved' }),
  })

  await dragHandle.dragTo(targetColumn)

  await expect(targetColumn.getByRole('link', { name: issueTitle })).toBeVisible()
  await expect(
    page.getByText(`${issueTitle} moved to Resolved.`),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: `Drag ${issueTitle}` })).toBeFocused()
  const moveControl = page.getByRole('combobox', { name: `Move ${issueTitle}` })
  const resolvedValue = await moveControl
    .locator('option', { hasText: 'Resolved' })
    .getAttribute('value')
  if (!resolvedValue) throw new Error('Expected the resolved workflow value.')
  await expect(moveControl).toHaveValue(resolvedValue)
})

test('moderates an issue comment with confirmation and an audit trail', async ({
  page,
}) => {
  await page.goto('/issues')
  await page
    .getByRole('link', { name: 'Publish the launch readiness brief' })
    .click()

  await page.getByRole('button', { name: 'Remove comment' }).click()
  await expect(page.getByText('Remove this comment?')).toBeVisible()
  let confirmRemove = page.getByRole('button', { name: 'Confirm remove' })
  await expect(confirmRemove).toBeFocused()
  await page.getByRole('button', { name: 'Cancel' }).click()
  const removeComment = page.getByRole('button', { name: 'Remove comment' })
  await expect(removeComment).toBeFocused()
  await removeComment.click()
  confirmRemove = page.getByRole('button', { name: 'Confirm remove' })
  await expect(confirmRemove).toBeFocused()
  await confirmRemove.click()

  await expect(page.getByText('Comment removed by moderation.')).toBeVisible()
  const tombstone = page.getByText('Comment removed by Omar Haddad.')
  await expect(tombstone).toBeVisible()
  await expect(tombstone.locator('..')).toBeFocused()
  await expect(page.getByText('Removed a comment as a moderator.')).toBeVisible()
})

test('searches globally with the keyboard shortcut', async ({ page }) => {
  await page.goto('/')

  const searchbox = page.getByRole('searchbox', { name: 'Search all issues' })
  await expect(searchbox).toBeVisible()
  await page.keyboard.press('/')
  await expect(searchbox).toBeFocused()
  await searchbox.fill('telemetry')
  await page
    .getByRole('link', { name: /Close the device telemetry coverage gap/i })
    .click()

  await expect(page).toHaveURL(/\/issues\/issue_/)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Close the device telemetry coverage gap',
    }),
  ).toBeVisible()
})

test('restores a private saved view and page-size preference after reload', async ({
  page,
}) => {
  await page.goto('/issues')
  await expect(page.getByRole('table', { name: 'Workspace issues' })).toBeVisible()

  await page.getByLabel('Priority').selectOption('urgent')
  await expect(page.getByText('2 matching issues')).toBeVisible()
  await page.getByLabel('View name').fill('Urgent operations')
  await page.getByRole('button', { name: 'Save current view' }).click()
  await expect(
    page.getByText('Urgent operations saved as a private view.'),
  ).toBeVisible()
  await page.getByLabel('Rows per page').selectOption('10')

  await page.reload()
  await expect(page.getByLabel('Rows per page')).toHaveValue('10')
  await page.getByLabel('Priority').selectOption('')
  await expect(page.getByText('6 matching issues')).toBeVisible()
  await page.getByLabel('Open saved view').selectOption({
    label: 'Urgent operations',
  })

  await expect(page).toHaveURL(/priority=urgent/)
  await expect(page.getByText('2 matching issues')).toBeVisible()
})

test('persists issue table columns and density after reload', async ({ page }) => {
  await page.goto('/issues')
  const table = page.getByRole('table', { name: 'Workspace issues' })
  await expect(table).toBeVisible()

  await page.getByRole('button', { name: 'Customize issue table' }).click()
  await page.getByRole('checkbox', { name: 'Project column' }).uncheck()
  await page.getByLabel('Row density').selectOption('compact')

  await expect(table.getByRole('columnheader', { name: 'Project' })).toHaveCount(0)
  await expect(table).toHaveClass(/data-table--compact/)

  await page.reload()
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Project' })).toHaveCount(0)
  await expect(table).toHaveClass(/data-table--compact/)
})

test('opens a permission-aware command palette and starts issue creation', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Commands' })).toBeVisible()

  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '')
  const commandSearch = palette.getByRole('combobox', { name: 'Search commands' })
  await commandSearch.fill('create issue')
  await commandSearch.press('Enter')

  await expect(page).toHaveURL('/issues?create=1')
  await expect(page.getByRole('dialog', { name: 'Create issue' })).toBeVisible()
})

test('reviews and clears the notification inbox', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Notifications, 1 unread' })
  await expect(trigger).toBeVisible()
  await trigger.click()

  const inbox = page.getByRole('region', { name: 'Notifications' })
  await expect(inbox).toBeVisible()
  const category = inbox.getByRole('combobox', { name: 'Category' })
  await expect(category).toContainText('Work (1)')
  await expect(category).toContainText('Collaboration (1)')
  await category.selectOption('collaboration')
  await expect(inbox.getByRole('link', { name: /New comment on OPS-1/ })).toBeVisible()
  await expect(inbox.getByRole('link', { name: /OPS-3 was updated/ })).not.toBeVisible()
  await inbox.getByRole('button', { name: 'Mark matching read' }).click()

  await expect(
    page.getByRole('button', { name: 'Notifications, 0 unread' }),
  ).toBeVisible()
  await expect(page.getByText('1 notification marked as read.')).toBeAttached()
})

test('persists dashboard widgets and reviews authoritative analytics', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('Tracked issues')).toBeVisible()
  await page.getByRole('button', { name: 'Customize dashboard' }).click()
  await page.getByRole('checkbox', { name: 'Overdue issues' }).check()
  await expect(
    page.getByLabel('Workspace summary').getByText('Overdue issues', { exact: true }),
  ).toBeVisible()

  await page.reload()
  await expect(
    page.getByLabel('Workspace summary').getByText('Overdue issues', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Analytics' }).click()

  await expect(page).toHaveURL('/analytics')
  await expect(
    page.getByRole('table', {
      name: 'Project issue volume, completion, urgency, and overdue work',
    }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Issues by priority' })).toBeVisible()
})

test('configures notification delivery and device settings', async ({ page }) => {
  await page.goto('/settings')
  const comments = page.getByRole('checkbox', { name: /New comments/ })
  await expect(comments).toBeChecked()
  await comments.click()
  await expect(page.getByText('Notification preferences saved.')).toBeVisible()
  await expect(comments).not.toBeChecked()

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(comments).not.toBeChecked()

  await page.getByRole('combobox', { name: 'Issues per page' }).selectOption('10')
  await expect(page.getByText('Device preferences saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Issues per page' })).toHaveValue('10')
})

test('administers revisioned workspace access with suspension confirmation', async ({
  page,
}) => {
  await page.goto('/administration')
  const directory = page.getByRole('table', {
    name: 'Workspace membership administration',
  })
  await expect(directory).toBeVisible()

  await directory.getByRole('button', { name: 'Edit Lena Ortiz' }).click()
  let dialog = page.getByRole('dialog', { name: 'Edit Lena Ortiz' })
  await dialog.getByLabel('Workspace role').selectOption('admin')
  await dialog.getByRole('button', { name: 'Save access' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(directory.getByRole('row', { name: /Lena Ortiz/ })).toContainText('Admin')

  await directory.getByRole('button', { name: 'Edit Theo Martin' }).click()
  dialog = page.getByRole('dialog', { name: 'Edit Theo Martin' })
  await dialog.getByLabel('Access status').selectOption('suspended')
  await dialog.getByRole('button', { name: 'Review suspension' }).click()
  const confirmation = page.getByRole('dialog', { name: 'Suspend Theo Martin?' })
  const suspend = confirmation.getByRole('button', { name: 'Suspend member' })
  await expect(suspend).toBeFocused()
  await suspend.click()
  await expect(confirmation).not.toBeVisible()
  await expect(directory.getByRole('row', { name: /Theo Martin/ })).toContainText(
    'Suspended',
  )

  await page.getByRole('link', { name: 'Governance' }).click()
  await page.getByRole('combobox', { name: 'Action' }).selectOption('membership.updated')
  await expect(
    page.getByRole('table', { name: 'Authoritative workspace audit events' }),
  ).toContainText('membership.updated')
})

test('provisions a workspace member through the invitation lifecycle', async ({
  page,
}) => {
  await page.goto('/administration')
  await expect(
    page.getByRole('heading', { name: 'Workspace invitations' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Invite member' }).click()
  let dialog = page.getByRole('dialog', { name: 'Invite workspace member' })
  const email = dialog.getByLabel('Email address')
  await expect(email).toBeFocused()
  await email.fill('release.manager@example.test')
  await dialog.getByLabel('Invitation role').selectOption('admin')
  await dialog.getByRole('button', { name: 'Create invitation' }).click()

  const invitations = page.getByRole('table', {
    name: 'Workspace invitation administration',
  })
  const invitation = invitations.getByRole('row', {
    name: /release.manager@example.test/,
  })
  await expect(invitation).toContainText('Pending')
  await invitation.getByRole('button', { name: 'Activate' }).click()
  dialog = page.getByRole('dialog', {
    name: 'Activate release.manager@example.test',
  })
  await dialog.getByLabel('Member name').fill('Rina Patel')
  await dialog.getByRole('button', { name: 'Activate member' }).click()

  await expect(invitation).toContainText('Accepted')
  await expect(invitation).toContainText('Complete')
  await expect(
    page
      .getByRole('table', { name: 'Workspace membership administration' })
      .getByRole('row', { name: /Rina Patel/ }),
  ).toContainText('Admin')

  await page.getByRole('combobox', { name: 'Invitation status' }).selectOption('accepted')
  await expect(page).toHaveURL(/inviteState=accepted/)
  await expect(invitation).toBeVisible()

  await page.getByRole('link', { name: 'Governance' }).click()
  await page
    .getByRole('combobox', { name: 'Action' })
    .selectOption('workspace.invitation.activated')
  await expect(
    page.getByRole('table', { name: 'Authoritative workspace audit events' }),
  ).toContainText('workspace.invitation.activated')
})

test('reviews the protected governance audit report', async ({ page }) => {
  await page.goto('/governance')
  await expect(page.getByRole('heading', { name: 'Governance' })).toBeVisible()
  const auditLog = page.getByRole('table', {
    name: 'Authoritative workspace audit events',
  })
  await expect(auditLog).toContainText('fixtures.created')

  await page.getByRole('combobox', { name: 'Outcome' }).selectOption('rejected')
  await expect(page.getByText('1 matching events')).toBeVisible()
  await expect(auditLog).toContainText('fixture-access-check-001')
  await expect(auditLog).not.toContainText('fixture-bootstrap-001')

  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByText('4 matching events')).toBeVisible()
  await page.getByRole('combobox', { name: 'Actor' }).selectOption('system')
  await expect(page.getByText('1 matching events')).toBeVisible()
  await page.getByRole('link', { name: 'fixture-bootstrap-001' }).click()
  await expect(page).toHaveURL(/request=fixture-bootstrap-001/)
  await expect(page.getByLabel('Request or correlation ID')).toHaveValue(
    'fixture-bootstrap-001',
  )
  await expect(page.getByRole('link', { name: 'Export this page' })).toHaveAttribute(
    'download',
    'falcontrack-audit-page-1.csv',
  )
})

test('explores collaboration activity with durable deep links', async ({ page }) => {
  await page.goto('/activity')

  await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible()
  const timeline = page.getByRole('list', { name: 'Workspace activity timeline' })
  await expect(timeline).toContainText('Moved the launch brief into progress.')
  await expect(
    timeline.getByRole('link', {
      name: 'OPS-1 · Publish the launch readiness brief',
      exact: true,
    }),
  ).toBeVisible()

  await timeline.getByRole('link', { name: 'issue.updated' }).click()
  await expect(page).toHaveURL(/action=issue.updated/)
  await expect(page.getByRole('combobox', { name: 'Action' })).toHaveValue('issue.updated')

  await timeline.getByRole('link', { name: /Filter activity for OPS-1/ }).click()
  await expect(page).toHaveURL(/entity=issue_/)
  await expect(page.getByRole('textbox', { name: 'Entity ID' })).not.toHaveValue('')
})
