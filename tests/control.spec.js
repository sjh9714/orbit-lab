import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const ids = ["orbit", "rover", "drone", "lander", "satellite"];
const polling = { timeout: 30_000, intervals: [50, 100, 150] };

async function telemetry(page) {
  return page.locator("#viewer-region").evaluate((element) => {
    const data = element.dataset;
    return {
      x: Number(data.x), y: Number(data.y), z: Number(data.z),
      heading: Number(data.heading), speed: Number(data.speed),
      time: Number(data.time), phase: data.phase,
      grounded: data.grounded === "true", paused: data.paused === "true",
    };
  });
}

async function until(page, predicate, message) {
  await expect.poll(async () => predicate(await telemetry(page)), {
    ...polling, message,
  }).toBe(true);
}

async function simulationTime(page, seconds) {
  const start = (await telemetry(page)).time;
  await until(page, (state) => state.time >= start + seconds,
    `${seconds}s of simulated time should elapse`);
}

async function painted(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function ready(page, id = "orbit") {
  await page.goto("/");
  await expect(page.locator("#viewer-region")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "control");
  await expect(page.locator("#mode-control")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pause-motion")).toBeEnabled();
  if (id !== "orbit") await select(page, id);
  await until(page, (state) => Number.isFinite(state.time), "simulation telemetry is available");
}

async function select(page, id) {
  const card = page.locator(`.model-card[data-model="${id}"]`);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#viewer-region")).toHaveAttribute("data-model", id);
}

async function pause(page) {
  if (!(await telemetry(page)).paused) await page.locator("#pause-motion").click();
  await expect(page.locator("#viewer-region")).toHaveAttribute("data-paused", "true");
  await painted(page);
}

async function resume(page) {
  if ((await telemetry(page)).paused) await page.locator("#pause-motion").click();
  await expect(page.locator("#viewer-region")).toHaveAttribute("data-paused", "false");
}

async function canvasImage(page) {
  // Exclude labels, hover states and button changes from render assertions.
  return page.locator("#robot-canvas").screenshot({
    style: "#viewer-region > :not(canvas) { visibility: hidden !important; }",
  });
}

function displacement(state, start = { x: 0, z: 0 }) {
  return Math.hypot(state.x - start.x, state.z - start.z);
}

test.describe("direct model control", () => {
  test.setTimeout(120_000);

  for (const id of ids) {
    test(`${id}: native keyboard input moves the actor and changes the rendered scene`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await ready(page, id);
      await pause(page);
      const initial = await canvasImage(page);
      const start = await telemetry(page);
      await page.locator("#robot-canvas").focus();
      const keys = id === "drone" ? ["Space", "w"] : ["w"];
      try {
        for (const key of keys) await page.keyboard.down(key);
        await until(page, (state) => displacement(state, start) > 0.5,
          `${id} should move at least half a metre`);
        if (id === "drone") {
          const state = await telemetry(page);
          expect(state.y).toBeGreaterThan(0.1);
          expect(state.grounded).toBe(false);
        }
      } finally {
        for (const key of keys) await page.keyboard.up(key);
      }
      await pause(page);
      const moved = await telemetry(page);
      expect(displacement(moved, start)).toBeGreaterThan(0.5);
      const rendered = await canvasImage(page);
      await writeFile(test.info().outputPath(`${id}-motion.png`), rendered);
      expect(rendered.equals(initial)).toBe(false);
      await test.info().attach(`${id}-before`, { body: initial, contentType: "image/png" });
      await test.info().attach(`${id}-after`, { body: rendered, contentType: "image/png" });
      await painted(page);
      expect((await canvasImage(page)).equals(rendered)).toBe(true);
      expect((await telemetry(page)).time).toBe(moved.time);
      expect(errors).toEqual([]);
    });
  }

  test("robot Space jump leaves the ground, lands and does not repeat while held", async ({ page }) => {
    await ready(page);
    await page.locator("#robot-canvas").focus();
    try {
      await page.keyboard.down("Space");
      await until(page, (state) => !state.grounded && state.y > 0.25,
        "robot should visibly leave the ground");
      const airborneTime = (await telemetry(page)).time;
      await until(page, (state) => state.grounded && state.time > airborneTime + 0.2,
        "robot should land after its jump");
      await simulationTime(page, 0.65);
      const landed = await telemetry(page);
      expect(landed.y).toBe(0);
      expect(landed.grounded).toBe(true);
      expect(landed.phase).toBe("idle");
    } finally {
      await page.keyboard.up("Space");
    }
    await page.keyboard.press("Space");
    await until(page, (state) => !state.grounded && state.y > 0.2,
      "a new Space press should start another jump");
  });

  test("drone Space ascends, release holds altitude, and Shift lands it", async ({ page }) => {
    await ready(page, "drone");
    await page.locator("#robot-canvas").focus();
    try {
      await page.keyboard.down("Space");
      await until(page, (state) => state.y > 1.2, "Space should raise the drone");
    } finally {
      await page.keyboard.up("Space");
    }
    await simulationTime(page, 0.65);
    const hover = await telemetry(page);
    await simulationTime(page, 0.5);
    const held = await telemetry(page);
    expect(Math.abs(held.y - hover.y)).toBeLessThan(0.015);
    expect(held.grounded).toBe(false);
    expect(held.y).toBeLessThanOrEqual(6);
    try {
      await page.keyboard.down("Shift");
      await until(page, (state) => state.y < hover.y - 0.35,
        "Shift should lower the drone");
      await until(page, (state) => state.grounded && state.y === 0,
        "drone should land without passing through the floor");
    } finally {
      await page.keyboard.up("Shift");
    }
    await simulationTime(page, 0.3);
    expect((await telemetry(page)).y).toBe(0);
    await expect(page.locator('[data-control="secondary"]')).toHaveAttribute("aria-pressed", "false");
  });

  test("switching models clears a key that is still physically held", async ({ page }) => {
    await ready(page);
    await page.locator("#robot-canvas").focus();
    await page.keyboard.down("w");
    try {
      await until(page, (state) => displacement(state) > 0.3, "first model should walk");
      await select(page, "rover");
      await simulationTime(page, 0.7);
      const next = await telemetry(page);
      expect(next.x).toBe(0);
      expect(next.z).toBe(0);
      expect(next.speed).toBe(0);
      expect(next.heading).toBe(0);
      await expect(page.locator('[data-control="forward"]')).toHaveAttribute("aria-pressed", "false");
    } finally {
      await page.keyboard.up("w");
    }
    await page.locator("#robot-canvas").focus();
    await page.keyboard.down("w");
    try {
      await until(page, (state) => displacement(state) > 0.3,
        "new input should control the selected model");
    } finally {
      await page.keyboard.up("w");
    }
  });

  test("window blur pauses the simulation, clears input and preserves a stable frame", async ({ page }) => {
    await ready(page, "rover");
    await page.locator("#robot-canvas").focus();
    await page.keyboard.down("w");
    try {
      await until(page, (state) => displacement(state) > 0.3, "rover should start driving");
      // Dispatch the standard focus-loss event; model state is never edited.
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await expect(page.locator("#viewer-region")).toHaveAttribute("data-paused", "true");
      await expect(page.locator('[data-control="forward"]')).toHaveAttribute("aria-pressed", "false");
      await painted(page);
      const frozen = await telemetry(page);
      const image = await canvasImage(page);
      await painted(page);
      expect(await telemetry(page)).toEqual(frozen);
      expect((await canvasImage(page)).equals(image)).toBe(true);
    } finally {
      await page.keyboard.up("w");
    }
    await resume(page);
    await simulationTime(page, 0.7);
    const stopped = await telemetry(page);
    expect(stopped.speed).toBe(0);
    await simulationTime(page, 0.4);
    expect(displacement(await telemetry(page), stopped)).toBeLessThan(0.001);
  });

  test("R resets position and held input, and switching modes restores an idle model", async ({ page }) => {
    await ready(page, "rover");
    await page.locator("#robot-canvas").focus();
    await page.keyboard.down("w");
    await page.keyboard.down("d");
    try {
      await until(page, (state) => displacement(state) > 0.3 && Math.abs(state.heading) > 0.2,
        "rover should drive and steer");
      await page.keyboard.press("r");
      await simulationTime(page, 0.5);
      const reset = await telemetry(page);
      expect(reset.x).toBe(0);
      expect(reset.z).toBe(0);
      expect(reset.heading).toBe(0);
      expect(reset.speed).toBe(0);
    } finally {
      await page.keyboard.up("w");
      await page.keyboard.up("d");
    }

    await page.locator("#mode-inspect").click();
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "inspect");
    await expect(page.locator("#control-panel")).toBeHidden();
    await page.locator("#robot-canvas").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#action-model")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#mode-control").click();
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "control");
    await expect(page.locator("#action-model")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#control-panel")).toBeVisible();
    await simulationTime(page, 0.5);
    expect(displacement(await telemetry(page))).toBe(0);

    await page.locator("#reset-view").click();
    await simulationTime(page, 0.3);
    const resetByButton = await telemetry(page);
    expect(resetByButton.x).toBe(0);
    expect(resetByButton.z).toBe(0);
    expect(resetByButton.speed).toBe(0);
  });

  test("focused direction and action buttons accept native Enter holds", async ({ page }) => {
    await ready(page);
    const forward = page.locator('[data-control="forward"]');
    await forward.focus();
    try {
      await page.keyboard.down("Enter");
      await expect(forward).toHaveAttribute("aria-pressed", "true");
      await until(page, (state) => displacement(state) > 0.3,
        "focused direction button should move the robot");
    } finally {
      await page.keyboard.up("Enter");
    }
    await expect(forward).toHaveAttribute("aria-pressed", "false");
    await page.locator('[data-control="primary"]').focus();
    await page.keyboard.press("Enter");
    await until(page, (state) => !state.grounded && state.y > 0.2,
      "focused action button should trigger a jump");
  });
});

async function centre(locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

test("native multi-touch supports movement plus jump, pointer capture, and cancellation", async ({ browser }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const session = await context.newCDPSession(page);
  const point = (position, id) => ({ ...position, id, radiusX: 3, radiusY: 3 });
  try {
    await ready(page);
    await page.locator("#control-panel").scrollIntoViewIfNeeded();
    const forward = page.locator('[data-control="forward"]');
    const primary = page.locator('[data-control="primary"]');
    const forwardPoint = await centre(forward);
    const primaryPoint = await centre(primary);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(forwardPoint, 0), point(primaryPoint, 1)],
    });
    await expect(forward).toHaveAttribute("aria-pressed", "true");
    await expect(primary).toHaveAttribute("aria-pressed", "true");
    await until(page, (state) => displacement(state) > 0.15 && !state.grounded && state.y > 0.2,
      "two fingers should move and jump together");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        point({ x: forwardPoint.x + 65, y: forwardPoint.y - 35 }, 0),
        point(primaryPoint, 1),
      ],
    });
    await simulationTime(page, 0.15);
    await expect(forward).toHaveAttribute("aria-pressed", "true");
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(forward).toHaveAttribute("aria-pressed", "false");
    await expect(primary).toHaveAttribute("aria-pressed", "false");
    await until(page, (state) => state.grounded && state.speed === 0,
      "cancelled touches should settle without stuck movement");
    const stopped = await telemetry(page);
    await simulationTime(page, 0.6);
    expect(displacement(await telemetry(page), stopped)).toBeLessThan(0.001);
    expect((await telemetry(page)).y).toBe(0);

    // A single cancelled steering finger must also stop an in-place turn.
    await page.locator('.model-card[data-model="rover"]').tap();
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-model", "rover");
    await page.locator("#control-panel").scrollIntoViewIfNeeded();
    const right = page.locator('[data-control="right"]');
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [point(await centre(right), 2)],
    });
    await until(page, (state) => Math.abs(state.heading) > 0.25,
      "direction-pad touch should steer the rover");
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(right).toHaveAttribute("aria-pressed", "false");
    await simulationTime(page, 0.2);
    const turned = await telemetry(page);
    await simulationTime(page, 0.4);
    const cancelled = await telemetry(page);
    expect(cancelled.heading).toBe(turned.heading);
    expect(displacement(cancelled)).toBe(0);
    expect(errors).toEqual([]);
    await pause(page);
    await page.screenshot({ path: test.info().outputPath("mobile-controls.png"), fullPage: true });
  } finally {
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }).catch(() => {});
    await session.detach();
    await context.close();
  }
});

test('landscape mode switches preserve the same fitted camera as a full reset', async ({ page }) => {
  // Instrument only this test response. The production module has no debug API.
  // Compare camera geometry directly: a resized transmission buffer can alter
  // a few glass pixels even when the camera matrices are identical.
  await page.route('**/src/viewer.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = '  return {\n    get model()';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      globalThis.readTestCamera = () => ({
        position: camera.position.toArray(), target: controls.target.toArray(),
        projection: camera.projectionMatrix.toArray(), inverse: camera.matrixWorldInverse.toArray(),
        min: controls.minDistance, max: controls.maxDistance,
      });
      return {
        get model()`),
    });
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await ready(page);
  await page.locator('#mode-inspect').click();
  const snapshot = async () => {
    await page.locator('#robot-canvas').evaluate(canvas => canvas.scrollIntoView({ block: 'center' }));
    await painted(page);
    return page.evaluate(() => globalThis.readTestCamera());
  };
  const switched = await snapshot();
  const compare = actual => {
    for (const key of ['position','target','projection','inverse']) {
      actual[key].forEach((value, index) => expect(value).toBeCloseTo(switched[key][index], 10));
    }
    expect(actual.max).toBeCloseTo(switched.max, 10);
    expect(actual.min).toBeCloseTo(switched.min, 10);
  };
  await page.locator('#reset-view').click();
  compare(await snapshot());
  await page.locator('#mode-control').click();
  await page.locator('#mode-inspect').click();
  compare(await snapshot());
});

test('native multi-touch supports drone flight and camera gestures across photo mode', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    reducedMotion: 'reduce', deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const point = (position, id) => ({ ...position, id, radiusX: 3, radiusY: 3 });
  const touch = (type, touchPoints = []) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
  try {
    await ready(page, 'drone');
    await page.locator('#control-panel').scrollIntoViewIfNeeded();
    await touch('touchStart', [
      point(await centre(page.locator('[data-control="forward"]')), 0),
      point(await centre(page.locator('#primary-action')), 1),
    ]);
    await until(page, s => s.y > .3 && displacement(s) > .3, 'two fingers should move and lift the drone');
    await touch('touchCancel');
    await until(page, s => s.speed < .001, 'touch cancellation should stop horizontal thrust');
    await simulationTime(page, .6);
    const hovering = await telemetry(page);
    await simulationTime(page, .3);
    expect((await telemetry(page)).y).toBeCloseTo(hovering.y, 4);

    await page.locator('#mode-photo').tap();
    const canvas = page.locator('#robot-canvas');
    await canvas.scrollIntoViewIfNeeded();
    await painted(page);
    const original = await canvasImage(page);
    let box = await canvas.boundingBox();
    const a = { x: box.x + box.width * .4, y: box.y + box.height * .5 };
    const b = { x: box.x + box.width * .6, y: box.y + box.height * .5 };
    await touch('touchStart', [point(a, 2), point(b, 3)]);
    await touch('touchMove', [point({ ...a, x: a.x - 35 }, 2), point({ ...b, x: b.x + 35 }, 3)]);
    await touch('touchEnd');
    await painted(page);
    expect((await canvasImage(page)).equals(original)).toBe(false);

    await page.locator('#mode-control').tap();
    await expect(page.locator('#viewer-region')).toHaveAttribute('data-paused', 'true');
    await page.locator('#control-panel').scrollIntoViewIfNeeded();
    const before = await telemetry(page);
    await touch('touchStart', [point(await centre(page.locator('#primary-action')), 4)]);
    await until(page, s => s.y > before.y + .2, 'flight buttons should still work after photo controls disconnect');
    await touch('touchCancel');
    await expect(page.locator('#primary-action')).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await touch('touchCancel').catch(() => {});
    await session.detach();
    await context.close();
  }
});
