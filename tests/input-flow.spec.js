import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#viewer-region')).toHaveAttribute('data-ready', 'true');
}

async function state(page) {
  return page.locator('#viewer-region').evaluate(element => {
    const d = element.dataset;
    return { x: +d.x, y: +d.y, z: +d.z, time: +d.time, paused: d.paused === 'true' };
  });
}

async function moveWithKeyboard(page, id) {
  const start = await state(page);
  const keys = id === 'drone' ? ['Space', 'w'] : ['w'];
  try {
    for (const key of keys) await page.keyboard.down(key);
    await expect.poll(async () => {
      const next = await state(page);
      return Math.hypot(next.x - start.x, next.z - start.z);
    }).toBeGreaterThan(.15);
    if (id === 'drone') expect((await state(page)).y).toBeGreaterThan(.03);
  } finally { for (const key of keys) await page.keyboard.up(key); }
}

// Start from the real clicked UI. Deliberately do not call canvas.focus(): that
// concealed the gap between selecting/resuming a model and pressing its keys.
for (const id of ['orbit', 'rover', 'drone', 'lander', 'satellite']) {
  test(`${id}: selecting the control model makes keyboard input immediately available`, async ({ page }) => {
    await ready(page);
    await page.locator(`.model-card[data-model="${id}"]`).click();
    await expect(page.locator('#robot-canvas')).toBeFocused();
    await moveWithKeyboard(page, id);
  });
}

test('entering control, resuming, and resetting all return input to the canvas', async ({ page }) => {
  await ready(page);
  await page.locator('#mode-inspect').click();
  await page.locator('#mode-control').click();
  await expect(page.locator('#robot-canvas')).toBeFocused();
  await moveWithKeyboard(page, 'orbit');
  await page.locator('#pause-motion').click();
  await expect(page.locator('#viewer-region')).toHaveAttribute('data-paused', 'true');
  await page.locator('#pause-motion').click();
  await expect(page.locator('#robot-canvas')).toBeFocused();
  await moveWithKeyboard(page, 'orbit');
  await page.locator('#reset-view').click();
  await expect(page.locator('#robot-canvas')).toBeFocused();
  expect((await state(page)).x).toBe(0);
  expect((await state(page)).z).toBe(0);
  await moveWithKeyboard(page, 'orbit');
});

test('after photography the explicit resume button immediately accepts flight keys', async ({ page }) => {
  await ready(page);
  await page.locator('.model-card[data-model="drone"]').click();
  await page.locator('#mode-photo').click();
  await page.locator('#close-photo').click();
  await expect(page.locator('#viewer-region')).toHaveAttribute('data-paused', 'true');
  const frozen = await state(page);
  await page.locator('#pause-motion').click();
  await expect(page.locator('#robot-canvas')).toBeFocused();
  await moveWithKeyboard(page, 'drone');
  expect((await state(page)).y).toBeGreaterThan(frozen.y);
});

test('unfocused keys leave ordinary buttons alone and focus guidance identifies the input target', async ({ page }) => {
  await ready(page);
  await page.locator('.model-card[data-model="orbit"]').click();
  await expect(page.locator('#keyboard-status')).toContainText('키보드 연결됨');
  await page.locator('#mode-inspect').focus();
  await expect(page.locator('#keyboard-status')).toContainText('3D 화면');
  await page.keyboard.press('w');
  await page.keyboard.press('ArrowUp');
  expect((await state(page)).x).toBe(0);
  expect((await state(page)).z).toBe(0);
  // Space activates the focused mode button; it must not jump the robot.
  await page.keyboard.press('Space');
  await expect(page.locator('#viewer-region')).toHaveAttribute('data-mode', 'inspect');
  expect((await state(page)).y).toBe(0);
});

test('mouse hold can take off a grounded drone, then hand control to the keyboard', async ({ page }) => {
  await ready(page);
  await page.locator('.model-card[data-model="drone"]').click();
  await expect(page.locator('#control-guide')).toContainText('이륙');
  // A user may arrive from any previously focused interface control.
  await page.locator('#mode-control').focus();
  const button = page.locator('#primary-action');
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  try {
    await page.mouse.down();
    await expect(page.locator('#robot-canvas')).toBeFocused();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await state(page)).y).toBeGreaterThan(.4);
  } finally { await page.mouse.up(); }
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await moveWithKeyboard(page, 'drone');
});

test('a held button clears on window blur and can be pressed again after returning', async ({ page }) => {
  await ready(page);
  const forward = page.locator('[data-control="forward"]');
  await forward.scrollIntoViewIfNeeded();
  const box = await forward.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => Math.hypot((await state(page)).x, (await state(page)).z)).toBeGreaterThan(.1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await expect(forward).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#viewer-region')).toHaveAttribute('data-paused', 'true');
  const stopped = await state(page);
  await page.mouse.down();
  try {
    await expect.poll(async () => {
      const next = await state(page);
      return Math.hypot(next.x - stopped.x, next.z - stopped.z);
    }).toBeGreaterThan(.1);
  } finally { await page.mouse.up(); }
});

test('right-clicking a direction button never starts movement', async ({ page }) => {
  await ready(page);
  await page.locator('[data-control="forward"]').click({ button: 'right' });
  await expect(page.locator('[data-control="forward"]')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  expect((await state(page)).x).toBe(0);
  expect((await state(page)).z).toBe(0);
});
