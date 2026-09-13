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


test('failed room inspection requeues cleaning and preserves evidence after recovery',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-09-12T12:00:00Z'));await page.goto('/operations');const actor=page.getByRole('combobox',{name:'Current actor'});const dialog=page.getByRole('dialog');const panel=page.getByRole('region',{name:'Checkout readiness gate'});
 const save=async()=>{await dialog.getByRole('button',{name:'Save command',exact:true}).click();await expect(dialog).toHaveCount(0);};
 await page.getByRole('button',{name:/^Guest reservations/}).click();await page.getByRole('button',{name:'Check in guest',exact:true}).click();await save();
 await panel.getByRole('button',{name:'Run: Post folio payment',exact:true}).click();await dialog.getByLabel('Payment (cents)',{exact:true}).fill('45000');await save();await panel.getByRole('button',{name:'Run: Check out and queue clean',exact:true}).click();await save();
 await actor.selectOption('actor-2');await panel.getByRole('button',{name:'Run: Finish room cleaning',exact:true}).click();await save();await panel.getByRole('button',{name:'Run: Reject room inspection',exact:true}).click();await dialog.getByLabel('Inspection findings',{exact:true}).fill('short');await dialog.getByRole('button',{name:'Save command',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('cleaning defect');
 await dialog.getByLabel('Inspection findings',{exact:true}).fill('Bathroom floor needs another cleaning pass.');await save();await page.reload();await expect(panel).toContainText('failed: Bathroom floor');
 await page.getByRole('button',{name:/^Room 204 /}).click();await expect(page.locator('.detail-title')).toContainText('dirty');
 await actor.selectOption('actor-2');await panel.getByRole('button',{name:'Run: Finish room cleaning',exact:true}).click();await save();await panel.getByRole('button',{name:'Run: Pass room inspection',exact:true}).click();await save();await page.reload();await expect(panel).toContainText('failed: Bathroom floor');await expect(panel).toContainText('passed: Room accepted');await expect(page.locator('.detail-title')).toContainText('ready');
});

test('front desk extends an in-house stay and recalculates only added nights',async({page})=>{
 await page.goto('/operations');const dialog=page.getByRole('dialog');const save=async()=>{await dialog.getByRole('button',{name:'Save command',exact:true}).click();await expect(dialog).toHaveCount(0);};
 await page.getByRole('combobox',{name:'Current actor'}).selectOption('actor-1');
 await page.getByRole('button',{name:/^Guest reservations/}).click();await page.getByRole('button',{name:'Check in guest',exact:true}).click();await save();
 await page.getByRole('button',{name:'Extend in-house stay',exact:true}).click();await dialog.getByLabel('New departure',{exact:true}).fill('2026-09-17');
 await dialog.getByLabel('Extension reason',{exact:true}).fill('Guest extended the business visit.');await save();await page.reload();
 await page.getByRole('button',{name:/^Guest reservations/}).click();await expect(page.locator('.detail')).toContainText('2026-09-17');
 await page.getByRole('button',{name:/^Guest folios/}).click();await expect(page.locator('.detail')).toContainText('75,000');
 await page.getByRole('button',{name:/^Stay extension history/}).click();await expect(page.locator('.detail')).toContainText('30,000');
 await expect(page.locator('.detail')).toContainText('Room 204');
});


test('approved guest credit changes settlement and enables checkout', async ({ page }) => {
    await page.goto('/operations');
    const actor = page.getByRole('combobox', { name: 'Current actor' });const dialog = page.getByRole('dialog');
    const save = async () => { await dialog.getByRole('button', { name: 'Save command', exact: true }).click();await expect(dialog).toHaveCount(0); };
    await actor.selectOption('actor-1');await page.getByRole('button', { name: /^Guest reservations/ }).click();
    await page.getByRole('button', { name: 'Check in guest', exact: true }).click();await save();
    await page.getByRole('button', { name: /^Guest folios/ }).click();
    await page.getByRole('button', { name: 'Request folio adjustment', exact: true }).click();
    await dialog.getByRole('spinbutton', { name: 'Adjustment amount (cents)', exact: true }).fill('5000');
    await dialog.getByLabel('Adjustment reference', { exact: true }).fill('SERVICE-UI-001');
    await dialog.getByLabel('Adjustment rationale', { exact: true }).fill('Guest service recovery credit for an interrupted arrival.');await save();
    await page.getByRole('button', { name: /^Folio adjustments/ }).click();await actor.selectOption('actor-0');
    await page.getByRole('button', { name: 'Approve and apply adjustment', exact: true }).click();
    await dialog.getByLabel('Adjustment rationale', { exact: true }).fill('Duty manager reviewed and approved the service recovery credit.');await save();
    await page.reload();await page.getByRole('button', { name: /^Guest folios/ }).click();
    await expect(page.locator('.detail dl')).toContainText('40,000');
    await actor.selectOption('actor-1');await page.getByRole('button', { name: 'Post folio payment', exact: true }).click();
    await dialog.getByRole('spinbutton', { name: 'Payment (cents)', exact: true }).fill('40000');await save();
    await page.getByRole('button', { name: /^Guest reservations/ }).click();
    await page.getByRole('button', { name: 'Check out and queue clean', exact: true }).click();await save();
    await expect(page.locator('.detail-title')).toContainText('checked-out');
});
test('approved group block preserves pickup and releases unused rooms',async({page})=>{await page.goto('/group-allotment');const role=page.getByRole('combobox',{name:'Group role'});await page.getByRole('button',{name:'Propose group block'}).click();await role.selectOption('Revenue Manager');await page.getByRole('button',{name:'Approve group block'}).click();await role.selectOption('Sales');await page.getByRole('button',{name:'Activate group block'}).click();await role.selectOption('Front Desk');await page.getByRole('button',{name:'Pick up group reservation'}).click();await role.selectOption('Revenue Manager');await page.getByRole('button',{name:'Release unused inventory'}).click();await expect(page.getByRole('status')).toContainText('released');await page.reload();await expect(page.getByText('released · 7 sellable rooms')).toBeVisible();await expect(page.getByRole('region',{name:'Group inventory history'})).toContainText('group-reservation-picked-up')});

test('arrival recovery assigns approved inventory and persists its custody trail',async({page})=>{
 await page.goto('/stay-control');const role=page.getByLabel('Hotel role');
 await page.getByRole('button',{name:'Open arrival recovery'}).click();await expect(page.getByRole('status')).toContainText('opened');
 await role.selectOption('Duty Manager');await page.getByRole('button',{name:'Approve alternative room'}).click();
 await role.selectOption('Front Desk');await page.getByRole('button',{name:'Complete room assignment'}).click();await page.reload();
 await expect(page.getByRole('heading',{name:'Arrival recovery',exact:true}).locator('..')).toContainText('resolved · room room-205');
 await expect(page.getByRole('region',{name:'Stay control history'})).toContainText('arrival-recovery-resolved');
});
