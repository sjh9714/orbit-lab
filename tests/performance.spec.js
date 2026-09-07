import { test, expect } from '@playwright/test';

// Observe the real renderer only in intercepted test code, not in the app.
async function observeRenderer(page) {
  await page.route('**/src/viewer.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = '  return {\n    get model()';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      let renderCount = 0, synchronousReads = 0;
      const renderScene = renderer.render.bind(renderer);
      renderer.render = (...args) => { renderCount++; return renderScene(...args); };
      const gl = renderer.getContext();
      const getParameter = gl.getParameter.bind(gl), isEnabled = gl.isEnabled.bind(gl);
      gl.getParameter = key => { if (key === gl.SCISSOR_BOX) synchronousReads++; return getParameter(key); };
      gl.isEnabled = key => { if (key === gl.SCISSOR_TEST) synchronousReads++; return isEnabled(key); };
      globalThis.readRenderStats = () => ({
        renderCount, synchronousReads, visible: canvasVisible,
        pixels: canvas.width * canvas.height, dpr: renderer.getPixelRatio(),
        time: motion?.state.time, elapsed,
      });
      globalThis.renderTestGraphics = { THREE, createStudio };
      return {
        get model()`),
    });
  });
  await page.goto('/');
  await expect(page.locator('#viewer-region')).toHaveAttribute('data-ready', 'true');
}

const stats = page => page.evaluate(() => readRenderStats());

test('animated studio shadows do not synchronously query GPU state', async ({ page }) => {
  await observeRenderer(page);
  await page.locator('#mode-inspect').click();
  await page.locator('#action-model').click();
  const start = await stats(page);
  await expect.poll(async () => (await stats(page)).renderCount - start.renderCount).toBeGreaterThan(30);
  expect((await stats(page)).synchronousReads).toBe(0);
});

test('a parked rover keeps simulation time but avoids drawing and rewriting controls', async ({ page }) => {
  await observeRenderer(page);
  await page.locator('.model-card[data-model="rover"]').click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    globalThis.controlMutations = 0;
    const observer = new MutationObserver(records => { controlMutations += records.length; });
    for (const selector of ['.mode-bar', '.photo-panel', '#action-model']) {
      observer.observe(document.querySelector(selector), { attributes: true, childList: true, subtree: true });
    }
  });
  const start = await stats(page);
  await expect.poll(async () => (await stats(page)).time - start.time).toBeGreaterThan(.5);
  expect((await stats(page)).renderCount).toBe(start.renderCount);
  expect(await page.evaluate(() => controlMutations)).toBe(0);
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => (await stats(page)).renderCount - start.renderCount).toBeGreaterThan(3);
    await expect.poll(async () => Math.abs(Number(await page.locator('#viewer-region').getAttribute('data-z')))).toBeGreaterThan(.15);
  } finally { await page.keyboard.up('w'); }
});

test('Retina live rendering has a bounded framebuffer while the CSS canvas stays full size', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2, reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await observeRenderer(page);
    await page.locator('#mode-photo').click();
    await expect.poll(async () => (await stats(page)).pixels).toBeLessThanOrEqual(1_250_000);
    expect((await stats(page)).pixels).toBeGreaterThan(1_000_000);
    const width = await page.locator('#robot-canvas').evaluate(canvas => canvas.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(1000);
    await expect(page.locator('#photo-size')).toHaveText('2048 × 1152');
  } finally { await context.close(); }
});

test('scrolling the canvas out of view stops GPU work and returning repaints it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 160 });
  await observeRenderer(page);
  await page.locator('#robot-canvas').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await stats(page)).visible).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(async () => (await stats(page)).visible).toBe(false);
  const offscreen = await stats(page);
  await expect.poll(async () => (await stats(page)).time - offscreen.time).toBeGreaterThan(.4);
  expect((await stats(page)).renderCount).toBe(offscreen.renderCount);
  await page.locator('#robot-canvas').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await stats(page)).renderCount).toBeGreaterThan(offscreen.renderCount);
});

test('studio passes preserve cached canvas and render-target viewport/scissor state', async ({ page }) => {
  await observeRenderer(page);
  const states = await page.evaluate(() => {
    const { THREE, createStudio } = renderTestGraphics;
    const renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(2);
    renderer.setSize(64, 64);
    renderer.setViewport(3, 4, 54, 52);
    renderer.setScissor(5, 6, 40, 38);
    renderer.setScissorTest(true);
    const target = new THREE.WebGLRenderTarget(64, 64);
    target.viewport.set(7, 8, 45, 42);
    target.scissor.set(9, 10, 32, 30);
    target.scissorTest = true;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const subject = new THREE.Mesh(geometry, material);
    subject.position.y = .5;
    const gl = renderer.getContext();
    const snapshot = () => ({
      viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
      scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
      scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
      cachedViewport: renderer.getViewport(new THREE.Vector4()).toArray(),
      cachedScissor: renderer.getScissor(new THREE.Vector4()).toArray(),
      target: renderer.getRenderTarget() === target,
    });
    let studio;
    try {
      const canvasBefore = snapshot();
      studio = createStudio(renderer);
      studio.mount.add(subject);
      studio.fit(subject);
      const canvasAfter = snapshot();
      renderer.setRenderTarget(target);
      const targetBefore = snapshot();
      studio.setPreset('cool');
      studio.updateShadow();
      const targetAfter = snapshot();
      return { canvasBefore, canvasAfter, targetBefore, targetAfter };
    } finally {
      studio?.dispose(); geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose();
    }
  });
  expect(states.canvasAfter).toEqual(states.canvasBefore);
  expect(states.targetAfter).toEqual(states.targetBefore);
});
