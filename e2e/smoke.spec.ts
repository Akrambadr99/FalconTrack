import { expect, test } from '@playwright/test'
test('StayPilot opens its durable operations workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('StayPilot', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByRole('button', { name: /^Create / }).click()
  await expect(page.getByRole('heading', { name: 'Create record' })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  const sections = page.locator('aside > button')
  if (await sections.count() > 1) await sections.nth(1).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export backup' }).click()
  await download
})
