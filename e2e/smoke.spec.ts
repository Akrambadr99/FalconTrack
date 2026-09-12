import{expect,test}from'@playwright/test';test('StayPilot exposes routed enterprise workflows',async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:'StayPilot command center'})).toBeVisible();await page.getByRole('link',{name:'Operations'}).click();await expect(page.getByRole('region',{name:'Room allocation preview'})).toContainText(/available|blocked/);await page.getByRole('link',{name:'Workflows'}).click();await expect(page.getByRole('heading',{name:'Workflow catalog'})).toBeVisible();await page.getByRole('link',{name:'Data model'}).click();await expect(page.getByRole('heading',{name:'Connected data model'})).toBeVisible();await page.getByRole('link',{name:'Data tools'}).click();await expect(page.getByRole('heading',{name:'Import and recovery tools'})).toBeVisible();await page.getByRole('textbox',{name:'Workspace JSON'}).fill('{}');await page.getByRole('button',{name:'Preview import'}).click();await expect(page.getByRole('alert')).toContainText('not a compatible');await page.getByRole('link',{name:'Activity',exact:true}).click();await expect(page.getByRole('heading',{name:'Operational activity'})).toBeVisible()})

test('room move retries a failed save and completes housekeeping after reload', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-12T10:00:00Z'));
    await page.goto('/operations');
    const actor = page.getByRole('combobox', { name: 'Current actor' });
    const action = async (name: string) => page.getByRole('button', { name, exact: true }).click();
    const save = async () => { await action('Save command'); await expect(page.getByRole('dialog')).toHaveCount(0); };
    await actor.selectOption('actor-1'); await page.getByRole('button', { name: /^Guest reservations/ }).click();
    await action('Check in guest'); await save(); await action('Plan guest room move');
    await page.getByRole('dialog').getByRole('combobox', { name: 'Destination room', exact: true }).selectOption('room-2');
    await page.getByRole('dialog').getByRole('textbox', { name: 'Move reason', exact: true }).fill('Move guest away from scheduled corridor noise.'); await save();
    await page.getByRole('button', { name: /^Room move requests/ }).click(); await action('Execute guest room move');
    await page.evaluate(() => {
        const prototype = (globalThis as unknown as { Storage: { prototype: { setItem: (key: string, value: string) => void } } }).Storage.prototype;
        const original = prototype.setItem;
        prototype.setItem = function(key: string, value: string) {
            if (key === 'staypilot:workspace:v1') { prototype.setItem = original; throw new Error('Storage temporarily unavailable'); }
            original.call(this, key, value);
        };
    });
    await action('Save command'); await expect(page.getByRole('alert')).toContainText('Storage temporarily unavailable');
    await save(); await page.reload();
    await page.getByRole('button', { name: /^Guest reservations/ }).click(); await expect(page.locator('.detail')).toContainText('Assigned roomRoom 501');
    await page.getByRole('button', { name: /^Housekeeping tasks/ }).click(); await expect(page.locator('.list .row')).toHaveCount(1);
    await actor.selectOption('actor-2'); await action('Finish room cleaning'); await save(); await action('Pass room inspection'); await save();
    await page.getByRole('button', { name: /^Room inventory/ }).click(); await page.getByRole('button', { name: /^Room 204 / }).click();
    await expect(page.locator('.detail-title')).toContainText('ready');
    await page.getByRole('button', { name: /^Room 501 / }).click(); await expect(page.locator('.detail-title')).toContainText('occupied');
});
