import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const models = [
  { id: "orbit", filename: "orbit-01.glb" },
  { id: "rover", filename: "rover-02.glb" },
  { id: "drone", filename: "scout-03.glb" },
  { id: "lander", filename: "lander-04.glb" },
  { id: "satellite", filename: "relay-05.glb" },
];

async function painted(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

// Locator screenshots include overlapping DOM. Hide that overlay only during
// capture so button labels/hover styles cannot masquerade as a moving model.
function sceneScreenshot(canvas) {
  return canvas.screenshot({
    style: "#viewer-region > :not(canvas) { visibility: hidden !important; }",
  });
}

async function ready(page) {
  await page.goto("/");
  await expect(page.locator("#viewer-region")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(page.locator("#download-model")).toBeEnabled();
  await expect(page.locator(".model-card")).toHaveCount(models.length);
  await page.locator("#mode-inspect").click();
  await expect(page.locator("#mode-inspect")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#action-model")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await painted(page);
}

async function selectModel(page, id) {
  const card = page.locator(`.model-card[data-model="${id}"]`);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".model-card[aria-pressed='true']")).toHaveCount(1);
  await expect(page.locator("#viewer-region")).toHaveAttribute(
    "data-model",
    id,
  );
  await painted(page);
}

test("collection and controls fit phones, tablets, desktops and breakpoint edges", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await ready(page);
  const dimensions = [
    [320, 568],
    [390, 844],
    [568, 320],
    [768, 1024],
    [799, 900],
    [801, 900],
    [844, 390],
    [1024, 600],
    [1099, 800],
    [1101, 800],
    [1440, 1000],
    [2560, 1440],
    [3840, 2160],
  ];
  const controls = {
    control:
      ".model-card, #mode-control, #mode-inspect, #pause-motion, [data-control], #zoom-in, #zoom-out, #reset-view, #download-model",
    inspect:
      ".model-card, #mode-control, #mode-inspect, #action-model, #auto-rotate, #zoom-in, #zoom-out, #reset-view, #download-model",
  };
  for (const [width, height] of dimensions) {
    await page.setViewportSize({ width, height });
    await selectModel(page, "lander");
    for (const mode of ["control", "inspect"]) {
      await test.step(`${mode}: ${width} × ${height}`, async () => {
        await page.locator(`#mode-${mode}`).click();
        await expect(page.locator(`#mode-${mode}`)).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await painted(page);
        const layout = await page.evaluate((selector) => {
          const bounds = [...document.querySelectorAll(selector)].flatMap((element) => {
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height || getComputedStyle(element).visibility === "hidden") return [];
            return [{
              name: element.dataset.model || element.dataset.control || element.id,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            }];
          });
          const collisions = bounds.flatMap((first, index) =>
            bounds
              .slice(index + 1)
              .filter(
                (second) =>
                  Math.min(first.right, second.right) -
                    Math.max(first.left, second.left) >
                    1 &&
                  Math.min(first.bottom, second.bottom) -
                    Math.max(first.top, second.top) >
                    1,
              )
              .map((second) => [first.name, second.name]),
          );
          const canvas = document
            .querySelector("#robot-canvas")
            .getBoundingClientRect();
          return {
            viewport: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            controls: bounds,
            collisions,
            canvas: { width: canvas.width, height: canvas.height },
          };
        }, controls[mode]);
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport + 1);
        expect(layout.collisions).toEqual([]);
        expect(layout.canvas.width).toBeGreaterThan(160);
        expect(layout.canvas.height).toBeGreaterThan(160);
        expect(layout.controls.map((control) => control.name)).toEqual(
          expect.arrayContaining([
            ...models.map((model) => model.id),
            "mode-control", "mode-inspect", "zoom-in", "zoom-out", "reset-view", "download-model",
            ...(mode === "control"
              ? ["pause-motion", "forward", "left", "right", "backward", "primary"]
              : ["action-model", "auto-rotate"]),
          ]),
        );
        for (const control of layout.controls) {
          expect(
            control.width,
            `${control.name} touch width`,
          ).toBeGreaterThanOrEqual(43.5);
          expect(
            control.height,
            `${control.name} touch height`,
          ).toBeGreaterThanOrEqual(43.5);
          expect(
            control.left,
            `${control.name} left edge`,
          ).toBeGreaterThanOrEqual(-0.5);
          expect(control.right, `${control.name} right edge`).toBeLessThanOrEqual(
            width + 0.5,
          );
        }
        await expect(page.locator(".model-card")).toHaveCount(5);
        if ([320, 844, 1440, 2560].includes(width)) {
          await page.screenshot({
            path: test.info().outputPath(`collection-${mode}-${width}x${height}.png`),
            fullPage: true,
          });
        }
      });
    }
  }
});

for (const { id, filename } of models) {
  test(`${id}: action, pause, turntable, zoom and reset affect the actual model`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);
    await selectModel(page, id);
    const canvas = page.locator("#robot-canvas");
    const action = page.locator("#action-model");
    const rotate = page.locator("#auto-rotate");
    await expect(action).toHaveAttribute("aria-pressed", "false");
    await expect(rotate).toHaveAttribute("aria-pressed", "false");
    const initial = await sceneScreenshot(canvas);

    await action.click();
    await expect(action).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await sceneScreenshot(canvas)).equals(initial))
      .toBe(false);
    await action.click();
    await expect(action).toHaveAttribute("aria-pressed", "false");
    await painted(page);
    const paused = await sceneScreenshot(canvas);
    // Observe a real interval to ensure the paused part does not keep moving.
    await page.waitForTimeout(200);
    expect((await sceneScreenshot(canvas)).equals(paused)).toBe(true);

    await rotate.click();
    await expect(rotate).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await sceneScreenshot(canvas)).equals(paused))
      .toBe(false);
    await rotate.click();
    await expect(rotate).toHaveAttribute("aria-pressed", "false");
    await page.locator("#reset-view").click();
    await expect
      .poll(async () => (await sceneScreenshot(canvas)).equals(initial))
      .toBe(true);

    await page.locator("#zoom-in").click();
    await expect
      .poll(async () => (await sceneScreenshot(canvas)).equals(initial))
      .toBe(false);
    const zoomed = await sceneScreenshot(canvas);
    await page.locator("#zoom-out").click();
    await expect
      .poll(async () => (await sceneScreenshot(canvas)).equals(zoomed))
      .toBe(false);

    await action.click();
    await rotate.click();
    await page.locator("#reset-view").click();
    await expect(action).toHaveAttribute("aria-pressed", "false");
    await expect(rotate).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () => (await sceneScreenshot(canvas)).equals(initial))
      .toBe(true);
    expect(errors).toEqual([]);
  });

  test(`${id}: selected GLB downloads and reloads without studio content`, async ({
    page,
  }) => {
    await ready(page);
    await selectModel(page, id);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#download-model").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    const path = test.info().outputPath(filename);
    await download.saveAs(path);
    const buffer = await readFile(path);
    expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
    expect(buffer.readUInt32LE(4)).toBe(2);
    expect(buffer.readUInt32LE(8)).toBe(buffer.length);
    const result = await page.evaluate(
      async ({ id, base64 }) => {
        const { Box3 } = await import("/node_modules/three/src/math/Box3.js");
        const { GLTFLoader } = await import(
          "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
        );
        const { createModel } = await import("/src/catalog.js");
        const { disposeRobot } = await import("/src/robot.js");
        const source = createModel(id);
        source.reset();
        const bytes = Uint8Array.from(atob(base64), (character) =>
          character.charCodeAt(0),
        );
        const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
        const describe = (root) => {
          let meshes = 0;
          let triangles = 0;
          let finite = true;
          const transforms = [];
          const materials = new Set();
          const unexpected = [];
          root.updateMatrixWorld(true);
          root.traverse((node) => {
            if (
              node.isLight ||
              node.isCamera ||
              node.name.startsWith("studio-")
            )
              unexpected.push(node.name);
            // GLTFLoader represents empty transform/group nodes as Object3D.
            // Child-index paths verify their hierarchy; userData.name preserves
            // original names that the loader sanitizes for animation bindings.
            if (!node.isMesh && !node.isCamera && !node.isLight) {
              const path = [];
              for (
                let ancestor = node;
                ancestor !== root;
                ancestor = ancestor.parent
              )
                path.unshift(ancestor.parent.children.indexOf(ancestor));
              transforms.push({
                path,
                name: node.userData.name || node.name,
                children: node.children.length,
                matrix: node.matrixWorld.toArray(),
              });
            }
            if (!node.isMesh) return;
            meshes++;
            triangles +=
              (node.geometry.index?.count ??
                node.geometry.attributes.position.count) / 3;
            finite &&= Array.from(
              node.geometry.attributes.position.array,
            ).every(Number.isFinite);
            (Array.isArray(node.material)
              ? node.material
              : [node.material]
            ).forEach((material) => materials.add(material.name));
          });
          const bounds = new Box3().setFromObject(root);
          return {
            meshes,
            triangles,
            finite,
            transforms,
            unexpected,
            materials: [...materials].sort(),
            bounds: [...bounds.min.toArray(), ...bounds.max.toArray()],
          };
        };
        const original = describe(source.root);
        const restored = describe(gltf.scene.children[0]);
        disposeRobot(source.root);
        if (source.effects) disposeRobot(source.effects);
        disposeRobot(gltf.scene);
        return {
          original,
          restored,
          sceneChildren: gltf.scene.children.length,
        };
      },
      { id, base64: buffer.toString("base64") },
    );
    expect(result.restored.finite).toBe(true);
    expect(result.restored.meshes).toBeGreaterThan(0);
    expect(result.restored.meshes).toBe(result.original.meshes);
    expect(result.restored.triangles).toBe(result.original.triangles);
    expect(result.restored.materials).toEqual(result.original.materials);
    expect(result.sceneChildren).toBe(1);
    expect(result.original.transforms.length).toBeGreaterThan(1);
    expect(result.restored.transforms).toHaveLength(
      result.original.transforms.length,
    );
    result.original.transforms.forEach((original, index) => {
      const restored = result.restored.transforms[index];
      expect(restored.path).toEqual(original.path);
      expect(restored.name).toBe(original.name);
      expect(restored.children).toBe(original.children);
      original.matrix.forEach((value, element) =>
        expect(restored.matrix[element]).toBeCloseTo(value, 5),
      );
    });
    expect(result.restored.unexpected).toEqual([]);
    result.original.bounds.forEach((value, index) =>
      expect(result.restored.bounds[index]).toBeCloseTo(value, 4),
    );
    await expect(page.locator("#download-status")).toContainText(filename);
    await expect(page.locator("#download-model")).toBeEnabled();
  });
}

test("native keyboard selection and canvas shortcuts work without a mouse", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const rover = page.locator('.model-card[data-model="rover"]');
  await rover.focus();
  await page.keyboard.press("Space");
  await expect(rover).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#viewer-region")).toHaveAttribute(
    "data-model",
    "rover",
  );
  const canvas = page.locator("#robot-canvas");
  await canvas.focus();
  await painted(page);
  const initial = await sceneScreenshot(canvas);
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => (await sceneScreenshot(canvas)).equals(initial))
    .toBe(false);
  const rotated = await sceneScreenshot(canvas);
  await page.keyboard.press("+");
  await expect
    .poll(async () => (await sceneScreenshot(canvas)).equals(rotated))
    .toBe(false);
  await page.keyboard.press("r");
  await expect
    .poll(async () => (await sceneScreenshot(canvas)).equals(initial))
    .toBe(true);
  const action = page.locator("#action-model");
  await action.focus();
  await page.keyboard.press("Enter");
  await expect(action).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(action).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("touch users can select a model and operate its controls", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await ready(page);
    const satellite = page.locator('.model-card[data-model="satellite"]');
    await satellite.tap();
    await expect(satellite).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#viewer-region")).toHaveAttribute(
      "data-model",
      "satellite",
    );
    await page.locator("#action-model").tap();
    await expect(page.locator("#action-model")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("#zoom-in").tap();
    await page.locator("#reset-view").tap();
    await expect(page.locator("#action-model")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator("#auto-rotate")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

test.describe("normal motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("switching models stops active motion and gives the next model a usable view", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);
    await page.locator("#action-model").click();
    await page.locator("#auto-rotate").click();
    await selectModel(page, "drone");
    await expect(page.locator("#action-model")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator("#auto-rotate")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const canvas = page.locator("#robot-canvas");
    const initial = await sceneScreenshot(canvas);
    await page.locator("#zoom-in").click();
    await expect
      .poll(async () => (await sceneScreenshot(canvas)).equals(initial))
      .toBe(false);
    await page.locator("#reset-view").click();
    await expect
      .poll(async () => (await sceneScreenshot(canvas)).equals(initial))
      .toBe(true);
    expect(errors).toEqual([]);
  });
});
