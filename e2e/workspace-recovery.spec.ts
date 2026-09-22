import { expect, test } from '@playwright/test'

test('duty manager captures and restores one verified guest workspace snapshot', async ({ page }) => {
  await page.goto('/data-tools')
  const capture = page.getByRole('button', { name: 'Capture workspace snapshot' })
  await page.getByLabel('Recovery actor').selectOption('actor-1')
  await expect(capture).toBeDisabled()
  await page.getByLabel('Recovery actor').selectOption('actor-0')
  await capture.click()
  await expect(page.getByLabel('Workspace recovery preview')).toContainText('verified for restore')
  await expect(page.getByLabel('Workspace recovery preview')).toContainText('source revision 0')
  await page.getByRole('button', { name: 'Restore verified workspace snapshot' }).click()
  await expect(page.getByRole('status')).toContainText('Workspace restored from snapshot')
  await expect(page.getByLabel('Workspace recovery preview')).toContainText('restore blocked')
  await page.reload()
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible()
})
