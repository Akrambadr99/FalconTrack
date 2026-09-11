import { expect, test } from '@playwright/test'

test('StayPilot exposes its primary domain workflow', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('StayPilot')
  await expect(page.getByRole('heading', { level: 1, name: 'Occupancy calendar' })).toBeVisible()
  await page.getByRole('button', { name: 'arrivals' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Arrivals board' })).toBeVisible()
})
