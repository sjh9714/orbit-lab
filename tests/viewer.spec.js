import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function sceneScreenshot(canvas, options = {}) {
  // A locator screenshot may leave a fractional bottom edge outside the phone
  // viewport. Center it first, then compare WebGL pixels without DOM overlays.
  await canvas.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
  );
  return canvas.screenshot({
    ...options,
    style: "#viewer-region > :not(canvas) { visibility: hidden !important; }",
  });
}

async function ready(page) {
  await page.goto("/");
  await expect(page.locator("#viewer-region")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "GLB 다운로드" }),
  ).toBeEnabled();
  await page.locator("#mode-inspect").click();
  await expect(page.locator("#mode-inspect")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#action-model")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  // WebGL output is submitted on animation frames, rather than DOM updates.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

test("mouse orbit, wheel zoom and reset change the rendered model without runtime errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await ready(page);
  const canvas = page.locator("#robot-canvas");
  const initial = await canvas.screenshot();
  const bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.55,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.25,
    bounds.y + bounds.height * 0.54,
    { steps: 6 },
  );
  await page.mouse.up();
  expect((await canvas.screenshot()).equals(initial)).toBe(false);
  const rotated = await canvas.screenshot();
  await page.mouse.wheel(0, -420);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(rotated))
    .toBe(false);
  await page.getByRole("button", { name: "전체 초기화" }).click();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(initial))
    .toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("desktop.png"),
    fullPage: true,
  });
});

test("downloaded GLB round-trips geometry, materials, transforms and editable part groups", async ({
  page,
}) => {
  await ready(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "GLB 다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("orbit-01.glb");
  const file = test.info().outputPath("orbit-01.glb");
  await download.saveAs(file);
  const buffer = await readFile(file);
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.length);
  const result = await page.evaluate(async (base64) => {
    const { Box3 } = await import("/node_modules/three/src/math/Box3.js");
    const { GLTFLoader } = await import(
      "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
    );
    const { createRobot, disposeRobot } = await import("/src/robot.js");
    const original = createRobot();
    const bytes = Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
    const loaded = gltf.scene;
    const describe = (object) => {
      const materialNames = new Set();
      const transforms = {};
      let meshes = 0;
      let triangles = 0;
      let invalid = false;
      object.updateMatrixWorld(true);
      object.traverse((node) => {
        if (node.isMesh) {
          meshes++;
          triangles +=
            (node.geometry.index?.count ??
              node.geometry.attributes.position.count) / 3;
          const list = Array.isArray(node.material)
            ? node.material
            : [node.material];
          list.forEach((material) => materialNames.add(material.name));
          if (
            !Array.from(node.geometry.attributes.position.array).every(
              Number.isFinite,
            )
          )
            invalid = true;
        }
        if (
          [
            "Head",
            "Torso",
            "Neck",
            "LegLeft",
            "LegRight",
            "ArmRightWaving",
            "ArmLeft",
            "Exploration-backpack",
          ].includes(node.name.replaceAll(".", ""))
        ) {
          transforms[node.name.replaceAll(".", "")] =
            node.matrixWorld.toArray();
        }
      });
      const bounds = new Box3().setFromObject(object);
      return {
        meshes,
        triangles,
        invalid,
        materialNames: [...materialNames].sort(),
        transforms,
        bounds: [...bounds.min.toArray(), ...bounds.max.toArray()],
      };
    };
    const source = describe(original);
    const restored = describe(loaded);
    const unexpected = [];
    loaded.traverse((node) => {
      if (node.isLight || node.isCamera || node.name.startsWith("studio-"))
        unexpected.push(node.name);
    });
    const glass = [];
    loaded.traverse((node) => {
      if (node.material?.name === "Blue coated lens glass")
        glass.push({
          transmission: node.material.transmission,
          ior: node.material.ior,
        });
    });
    disposeRobot(original);
    disposeRobot(loaded);
    return { source, restored, unexpected, glass };
  }, buffer.toString("base64"));
  expect(result.restored.invalid).toBe(false);
  expect(result.restored.meshes).toBe(result.source.meshes);
  expect(result.restored.triangles).toBe(result.source.triangles);
  expect(result.restored.materialNames).toEqual(result.source.materialNames);
  expect(Object.keys(result.restored.transforms).sort()).toEqual(
    Object.keys(result.source.transforms).sort(),
  );
  for (const [name, transform] of Object.entries(result.source.transforms)) {
    transform.forEach((value, i) =>
      expect(result.restored.transforms[name][i]).toBeCloseTo(value, 5),
    );
  }
  result.source.bounds.forEach((value, i) =>
    expect(result.restored.bounds[i]).toBeCloseTo(value, 4),
  );
  expect(result.source.bounds[1]).toBeCloseTo(0, 5);
  expect(result.unexpected).toEqual([]);
  expect(result.glass).toHaveLength(2);
  result.glass.forEach((glass) =>
    expect(glass.transmission).toBeCloseTo(0.92, 3),
  );
  await expect(page.locator("#download-status")).toContainText("orbit-01.glb");
  console.log(
    JSON.stringify({
      glbBytes: buffer.length,
      meshes: result.restored.meshes,
      triangles: result.restored.triangles,
      materials: result.restored.materialNames.length,
    }),
  );
});

test("a failed export can be retried successfully", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const original = FileReader.prototype.readAsArrayBuffer;
    FileReader.prototype.readAsArrayBuffer = function (...args) {
      FileReader.prototype.readAsArrayBuffer = original;
      throw new Error("Intentional one-shot export failure");
    };
  });
  const button = page.getByRole("button", { name: "GLB 다운로드" });
  await button.click();
  await expect(page.locator("#download-status")).toHaveAttribute(
    "data-error",
    "true",
  );
  await expect(button).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await button.click();
  expect((await downloadPromise).suggestedFilename()).toBe("orbit-01.glb");
  await expect(page.locator("#download-status")).toHaveAttribute(
    "data-error",
    "false",
  );
});

test("phone layout stays within its viewport and supports touch orbit and pinch zoom", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await ready(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const canvas = page.locator("#robot-canvas");
    const initial = await sceneScreenshot(canvas, {
      path: test.info().outputPath("phone-initial-canvas.png"),
    });
    // Read touch coordinates after the screenshot has positioned the canvas.
    const bounds = await canvas.boundingBox();
    const session = await context.newCDPSession(page);
    const touch = (x, y, id = 0) => ({ x, y, id, radiusX: 2, radiusY: 2 });
    const center = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touch(center.x + 55, center.y)],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [touch(center.x - 55, center.y + 10)],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect((await sceneScreenshot(canvas)).equals(initial)).toBe(false);
    const rotated = await sceneScreenshot(canvas);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        touch(center.x - 28, center.y, 0),
        touch(center.x + 28, center.y, 1),
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        touch(center.x - 60, center.y, 0),
        touch(center.x + 60, center.y, 1),
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect((await sceneScreenshot(canvas)).equals(rotated)).toBe(false);
    await page.getByRole("button", { name: "전체 초기화" }).click();
    await expect
      .poll(async () =>
        (await sceneScreenshot(canvas, {
          path: test.info().outputPath("phone-reset-canvas.png"),
        })).equals(initial),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "GLB 다운로드" }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("phone.png"),
      fullPage: true,
    });
    await session.detach();
  } finally {
    await context.close();
  }
});

test("a missing WebGL context shows an accessible recovery message", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === "webgl2" ? null : original.call(this, type, ...args);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "3D 화면을 열지 못했어요.",
  );
  const reload = page.getByRole("button", { name: "다시 불러오기" });
  await expect(reload).toBeVisible();
  await expect(reload).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "GLB 다운로드" }),
  ).toBeDisabled();
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    reload.click(),
  ]);
  expect(
    await page.evaluate(() => performance.getEntriesByType("navigation")[0].type),
  ).toBe("reload");
  await expect(page.getByRole("alert")).toContainText(
    "3D 화면을 열지 못했어요.",
  );
  await expect(reload).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "GLB 다운로드" }),
  ).toBeDisabled();
});
