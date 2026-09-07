import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const models = ["orbit", "rover", "drone", "lander", "satellite"];
const presets = ["warm", "cool", "rim"];
const compositions = ["full", "detail", "back"];
const formats = [
  { ratio: "16:9", longEdge: 2048, width: 2048, height: 1152 },
  { ratio: "16:9", longEdge: 3840, width: 3840, height: 2160 },
  { ratio: "1:1", longEdge: 2048, width: 2048, height: 2048 },
  { ratio: "1:1", longEdge: 3840, width: 3840, height: 3840 },
  { ratio: "4:5", longEdge: 2048, width: 1638, height: 2048 },
  { ratio: "4:5", longEdge: 3840, width: 3072, height: 3840 },
];
const viewports = [
  [320, 568], [390, 844], [568, 320], [768, 1024], [799, 900],
  [801, 900], [844, 390], [1024, 600], [1099, 800], [1101, 800],
  [1440, 1000], [2560, 1440], [3840, 2160],
];

async function painted(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function ready(page, id = "orbit") {
  await page.goto("/");
  await expect(page.locator("#viewer-region")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#mode-photo")).toBeEnabled();
  if (id !== "orbit") await selectModel(page, id);
}

async function selectModel(page, id) {
  const card = page.locator(`.model-card[data-model="${id}"]`);
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#viewer-region")).toHaveAttribute("data-model", id);
}

async function enterPhoto(page) {
  await page.locator("#mode-photo").click();
  await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "photo");
  await expect(page.locator("#mode-photo")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".photo-panel")).toBeVisible();
  await expect(page.locator("#save-photo")).toBeEnabled();
  await painted(page);
}

async function choose(page, setting, value) {
  const button = page.locator(`.photo-options[data-setting="${setting}"] [data-value="${value}"]`);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await painted(page);
}

async function canvasImage(page) {
  await page.locator("#robot-canvas").scrollIntoViewIfNeeded();
  await painted(page);
  // Labels and focus/hover decoration cannot stand in for model pixels.
  return page.locator("#robot-canvas").screenshot({
    style: "#viewer-region > :not(canvas) { visibility: hidden !important; }",
  });
}

async function telemetry(page) {
  return page.locator("#viewer-region").evaluate(element => {
    const data = element.dataset;
    return {
      x: Number(data.x), y: Number(data.y), z: Number(data.z),
      heading: Number(data.heading), time: Number(data.time),
      paused: data.paused === "true",
    };
  });
}

async function moving(page, minimum = .25) {
  await expect.poll(async () => {
    const state = await telemetry(page);
    return Math.hypot(state.x, state.z);
  }, { timeout: 30_000, intervals: [50, 100, 150] }).toBeGreaterThan(minimum);
}

// Expose read-only snapshots in the intercepted test response, never in the
// application. Pixel equality alone is unreliable for resized glass buffers.
async function observeViewer(page) {
  await page.route("**/src/viewer.js", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "  return {\n    get model()";
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      globalThis.readPhotoTestState = () => {
        const pose = root => {
          if (!root) return null;
          const result = [];
          root.traverse(node => result.push([node.name, ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]));
          return result;
        };
        const cameraState = (value, orbit) => ({
          position: value.position.toArray(), target: orbit.target.toArray(),
          projection: value.projectionMatrix.toArray(), inverse: value.matrixWorldInverse.toArray(),
          near: value.near, far: value.far, min: orbit.minDistance, max: orbit.maxDistance,
          distance: value.position.distanceTo(orbit.target),
        });
        let photo = null;
        if (photograph) {
          photograph.subject.updateWorldMatrix(true, true);
          photograph.camera.updateMatrixWorld();
          const bounds = new THREE.Box3().setFromObject(photograph.subject, true);
          const definition = modelDefinitions.find(item => item.id === modelId);
          const focus = photograph.root.getObjectByName(definition.photo.focus);
          const focusBounds = focus ? new THREE.Box3().setFromObject(focus) : null;
          const center = bounds.getCenter(new THREE.Vector3());
          const pedestal = studio.scene.getObjectByName('studio-pedestal');
          const framed = bounds.clone().union(new THREE.Box3().setFromObject(pedestal, true));
          const projected = [];
          for (const x of [framed.min.x,framed.max.x]) for (const y of [framed.min.y,framed.max.y]) for (const z of [framed.min.z,framed.max.z]) {
            projected.push(new THREE.Vector3(x,y,z).project(photograph.camera).toArray());
          }
          const contact = studio.scene.getObjectByName('studio-subject-contact');
          photo = {
            pose: pose(photograph.root), camera: cameraState(photograph.camera, photograph.controls),
            center: center.toArray(), minimum: bounds.min.toArray(), maximum: bounds.max.toArray(), projected,
            focusCenter: focusBounds?.getCenter(new THREE.Vector3()).toArray(),
            contact: { visible: contact.visible, position: contact.position.toArray(), scale: contact.scale.toArray(), texture: Boolean(contact.material.map?.isTexture) },
            pedestal: pedestal.position.toArray(),
          };
        }
        return {
          mode, paused, playing, elapsed, settings: { ...photoSettings },
          liveCamera: cameraState(camera, controls), livePose: pose(current?.root),
          actor: { position: actor.position.toArray(), quaternion: actor.quaternion.toArray() }, photo,
        };
      };
      return {
        get model()`),
    });
  });
}

async function snapshot(page) {
  await painted(page);
  return page.evaluate(() => globalThis.readPhotoTestState());
}

function sameCamera(actual, expected) {
  for (const key of ["position", "target", "projection", "inverse"]) {
    actual[key].forEach((value, index) => expect(value, `${key}[${index}]`).toBeCloseTo(expected[key][index], 9));
  }
  for (const key of ["min", "max", "near", "far", "distance"]) expect(actual[key], key).toBeCloseTo(expected[key], 9);
}

async function save(page, button = "#save-photo") {
  const pending = page.waitForEvent("download", { timeout: 90_000 });
  await page.locator(button).click();
  const download = await pending;
  const path = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  await expect(page.locator("#save-photo")).toBeEnabled();
  await expect(page.locator("#photo-status")).toHaveAttribute("data-error", "false");
  await expect(page.locator("#photo-status")).toContainText("저장했어요");
  return { bytes: await readFile(path), name: download.suggestedFilename(), path };
}

// Decode the files a user actually receives. Small samples compare display
// colour and orientation without a PNG dependency or WebGL implementation APIs.
async function imageStats(page, bytes, reference) {
  return page.evaluate(async ({ encoded, reference }) => {
    async function decode(value) {
      const image = new Image();
      image.src = `data:image/png;base64,${value}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 96; canvas.height = 96;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, 96, 96);
      return { width: image.naturalWidth, height: image.naturalHeight, pixels: context.getImageData(0, 0, 96, 96).data };
    }
    const image = await decode(encoded);
    const other = reference ? await decode(reference) : null;
    let sum = 0, square = 0, minimum = 255, maximum = 0, count = 0;
    let difference = 0, flippedDifference = 0, opaque = 0;
    const mean = [0, 0, 0];
    for (let y = 4; y < 92; y++) for (let x = 4; x < 92; x++) {
      const index = (y * 96 + x) * 4;
      const flipped = ((95 - y) * 96 + x) * 4;
      const luminance = image.pixels[index] * .2126 + image.pixels[index + 1] * .7152 + image.pixels[index + 2] * .0722;
      sum += luminance; square += luminance * luminance;
      minimum = Math.min(minimum, luminance); maximum = Math.max(maximum, luminance);
      opaque += Number(image.pixels[index + 3] === 255); count++;
      for (let channel = 0; channel < 3; channel++) {
        mean[channel] += image.pixels[index + channel];
        if (other) {
          difference += Math.abs(image.pixels[index + channel] - other.pixels[index + channel]);
          flippedDifference += Math.abs(image.pixels[index + channel] - other.pixels[flipped + channel]);
        }
      }
    }
    return {
      width: image.width, height: image.height,
      deviation: Math.sqrt(Math.max(0, square / count - (sum / count) ** 2)),
      range: maximum - minimum, opaque: opaque / count, mean: mean.map(value => value / count),
      difference: difference / (count * 3), flippedDifference: flippedDifference / (count * 3),
    };
  }, { encoded: bytes.toString("base64"), reference: reference?.toString("base64") });
}

function hasSubject(stats) {
  expect(stats.deviation, "a visible subject should produce tonal variation").toBeGreaterThan(8);
  expect(stats.range, "the image must contain more than an empty studio background").toBeGreaterThan(45);
  expect(stats.opaque).toBeGreaterThan(.995);
}

async function contactSheet(page, cells) {
  const encoded = await page.evaluate(async cells => {
    const canvas = document.createElement("canvas");
    canvas.width = 960; canvas.height = 636;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f1efe7"; context.fillRect(0, 0, canvas.width, canvas.height);
    for (const [index, cell] of cells.entries()) {
      const image = new Image(); image.src = `data:image/png;base64,${cell.png}`; await image.decode();
      const x = (index % 3) * 320, y = Math.floor(index / 3) * 212;
      context.drawImage(image, x, y, 320, 180);
      context.fillStyle = "#35412c"; context.font = "12px sans-serif";
      context.fillText(cell.label, x + 10, y + 201);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, cells);
  return Buffer.from(encoded, "base64");
}

test.describe("photograph lifecycle", () => {
  test.setTimeout(120_000);

  test("a moving control pose freezes in photo mode and closes with its camera and position paused", async ({ page }) => {
    await observeViewer(page);
    await ready(page);
    await page.locator("#robot-canvas").focus();
    await page.keyboard.down("w");
    try {
      await moving(page);
      await enterPhoto(page);
    } finally { await page.keyboard.up("w"); }
    const frozen = await snapshot(page);
    const time = await telemetry(page);
    expect(frozen.photo.pose).toEqual(frozen.livePose);
    expect(frozen.paused).toBe(true);
    expect(Math.hypot(...[frozen.actor.position[0], frozen.actor.position[2]])).toBeGreaterThan(.25);
    await expect(page.locator('[data-control="forward"]')).toHaveAttribute("aria-pressed", "false");

    await choose(page, "composition", "back");
    await choose(page, "ratio", "1:1");
    await page.locator("#photo-preset").selectOption("cool");
    await page.locator("#robot-canvas").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("+");
    await page.keyboard.press("Space");
    await page.keyboard.press("w");
    const photographed = await snapshot(page);
    expect(await telemetry(page)).toEqual(time);
    expect(photographed.actor).toEqual(frozen.actor);
    expect(photographed.livePose).toEqual(frozen.livePose);
    expect(photographed.photo.pose).toEqual(frozen.photo.pose);
    sameCamera(photographed.liveCamera, frozen.liveCamera);

    await page.locator("#close-photo").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "control");
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-paused", "true");
    await expect(page.locator("#mode-photo")).toBeFocused();
    const restored = await snapshot(page);
    expect(restored.actor).toEqual(frozen.actor);
    expect(restored.livePose).toEqual(frozen.livePose);
    sameCamera(restored.liveCamera, frozen.liveCamera);
    expect(await telemetry(page)).toEqual(time);
    const before = restored.actor.position;
    await page.locator("#robot-canvas").focus();
    await page.keyboard.down("w");
    try {
      await expect.poll(async () => {
        const state = await snapshot(page);
        return Math.hypot(state.actor.position[0] - before[0], state.actor.position[2] - before[2]);
      }, { timeout: 30_000 }).toBeGreaterThan(.2);
    } finally { await page.keyboard.up("w"); }
  });

  test("an inspect action is captured mid-pose, then resumes only after an explicit play action", async ({ page }) => {
    await observeViewer(page);
    await ready(page, "rover");
    await page.locator("#mode-inspect").click();
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "inspect");
    await page.locator("#action-model").click();
    await expect(page.locator("#action-model")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await snapshot(page)).elapsed, { timeout: 30_000 }).toBeGreaterThan(.35);
    await enterPhoto(page);
    const frozen = await snapshot(page);
    expect(frozen.elapsed).toBeGreaterThan(.35);
    expect(frozen.photo.pose).toEqual(frozen.livePose);
    await choose(page, "composition", "detail");
    await choose(page, "ratio", "4:5");
    const changed = await snapshot(page);
    expect(changed.elapsed).toBe(frozen.elapsed);
    expect(changed.livePose).toEqual(frozen.livePose);
    expect(changed.photo.pose).toEqual(frozen.photo.pose);
    await page.locator("#close-photo").click();
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "inspect");
    await expect(page.locator("#action-model")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#auto-rotate")).toHaveAttribute("aria-pressed", "false");
    const restored = await snapshot(page);
    expect(restored.elapsed).toBe(frozen.elapsed);
    expect(restored.livePose).toEqual(frozen.livePose);
    sameCamera(restored.liveCamera, frozen.liveCamera);
    await page.locator("#action-model").click();
    await expect.poll(async () => (await snapshot(page)).elapsed, { timeout: 30_000 }).toBeGreaterThan(frozen.elapsed + .25);
    expect((await snapshot(page)).livePose).not.toEqual(frozen.livePose);
  });

  test("model selection rebuilds only the photo subject, and both mode buttons exit safely", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await observeViewer(page);
    await ready(page);
    await enterPhoto(page);
    await choose(page, "ratio", "4:5");
    await page.locator("#photo-preset").selectOption("cool");
    for (const id of models) {
      await selectModel(page, id);
      await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "photo");
      await expect(page.locator("#photo-preset")).toHaveValue("cool");
      await expect(page.locator('[data-setting="ratio"] [data-value="4:5"]')).toHaveAttribute("aria-pressed", "true");
      const current = await snapshot(page);
      expect(current.photo.pose).toEqual(current.livePose);
      hasSubject(await imageStats(page, await canvasImage(page)));
    }
    await page.locator("#mode-inspect").click();
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "inspect");
    await expect(page.locator(".photo-panel")).toBeHidden();
    await enterPhoto(page);
    await page.locator("#mode-control").click();
    await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "control");
    await expect(page.locator("#control-panel")).toBeVisible();
    expect((await snapshot(page)).photo).toBeNull();
    hasSubject(await imageStats(page, await canvasImage(page)));
    expect(errors).toEqual([]);
  });

  test("portrait photo framing survives output resolution and desktop/mobile viewport changes", async ({ page }) => {
    await observeViewer(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ready(page);
    await enterPhoto(page);
    await choose(page, "ratio", "4:5");
    await expect(page.locator("#photo-resolution")).toHaveValue("2048");
    await expect(page.locator("#photo-size")).toHaveText("1638 × 2048");
    const composed = (await snapshot(page)).photo.camera;
    await page.locator("#robot-canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("+");
    const framed = (await snapshot(page)).photo.camera;
    expect(framed.position).not.toEqual(composed.position);
    expect(framed.distance).toBeLessThan(composed.distance);

    const retainsFraming = async () => {
      const actual = (await snapshot(page)).photo.camera;
      // Integer output dimensions and fractional CSS sizes can change the
      // projection aspect slightly; they must never recompose an edited view.
      for (const key of ["position", "target"]) {
        actual[key].forEach((value, index) => expect(value, `${key}[${index}]`).toBeCloseTo(framed[key][index], 8));
      }
      expect(actual.distance).toBeCloseTo(framed.distance, 8);
    };
    await page.locator("#photo-resolution").selectOption("3840");
    await expect(page.locator("#photo-resolution")).toHaveValue("3840");
    await expect(page.locator("#photo-size")).toHaveText("3072 × 3840");
    await retainsFraming();
    await page.setViewportSize({ width: 390, height: 844 });
    await retainsFraming();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await retainsFraming();
  });

  test("photo orbit and zoom accept keyboard and pointer input, while R restores the composition", async ({ page }) => {
    await observeViewer(page);
    await ready(page);
    await enterPhoto(page);
    const initial = (await snapshot(page)).photo.camera;
    await page.locator("#robot-canvas").focus();
    await page.keyboard.press("ArrowRight");
    const orbited = (await snapshot(page)).photo.camera;
    expect(orbited.position).not.toEqual(initial.position);
    expect(orbited.distance).toBeCloseTo(initial.distance, 8);
    await page.keyboard.press("+");
    const zoomed = (await snapshot(page)).photo.camera;
    expect(zoomed.distance).toBeLessThan(orbited.distance);
    await page.keyboard.press("r");
    sameCamera((await snapshot(page)).photo.camera, initial);
    const box = await page.locator("#robot-canvas").boundingBox();
    await page.mouse.move(box.x + box.width * .55, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .72, box.y + box.height * .55, { steps: 8 });
    await page.mouse.up();
    const dragged = (await snapshot(page)).photo.camera;
    expect(dragged.position).not.toEqual(initial.position);
    await page.mouse.wheel(0, -150);
    await expect.poll(async () => (await snapshot(page)).photo.camera.distance).toBeLessThan(dragged.distance);
    await page.locator("#robot-canvas").focus();
    for (let index = 0; index < 40; index++) await page.keyboard.press("+");
    const near = (await snapshot(page)).photo.camera;
    expect(near.distance).toBeGreaterThanOrEqual(near.min - 1e-8);
    await page.keyboard.press("r");
    sameCamera((await snapshot(page)).photo.camera, initial);
  });
});

test.describe('photography with camera damping', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('leaving a photo after a recent orbit preserves the frozen live camera', async ({ page }) => {
    await observeViewer(page);
    await ready(page);
    await page.locator('#mode-inspect').click();
    const box = await page.locator('#robot-canvas').boundingBox();
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5);
    await page.mouse.up();
    await enterPhoto(page);
    const frozen = await snapshot(page);
    await page.locator('#close-photo').click();
    const restored = await snapshot(page);
    sameCamera(restored.liveCamera, frozen.liveCamera);
  });
});

test.describe("downloaded photographs", () => {
  test.setTimeout(180_000);

  for (const format of formats) {
    test(`${format.ratio} at ${format.longEdge}px downloads matching dimensions, colour and orientation`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await ready(page);
      await enterPhoto(page);
      await choose(page, "ratio", format.ratio);
      await page.locator("#photo-resolution").selectOption(String(format.longEdge));
      await expect(page.locator("#photo-size")).toHaveText(`${format.width} × ${format.height}`);
      const preview = await canvasImage(page);
      const downloaded = await save(page);
      expect(downloaded.name).toBe(`orbit-01-warm-full-${format.width}x${format.height}.png`);
      const stats = await imageStats(page, downloaded.bytes, preview);
      expect([stats.width, stats.height]).toEqual([format.width, format.height]);
      hasSubject(stats);
      // Multisampling and export resolution may affect edge pixels, but not
      // the display transform or the vertical orientation of the photograph.
      expect(stats.difference).toBeLessThan(12);
      expect(stats.flippedDifference).toBeGreaterThan(stats.difference + 2);
      const after = await canvasImage(page);
      expect((await imageStats(page, after, preview)).difference).toBeLessThan(1);
      await test.info().attach("preview", { body: preview, contentType: "image/png" });
      expect(errors).toEqual([]);
    });
  }

  for (const recovery of ["retry", "lower resolution"]) {
    test(`a one-time PNG encoder failure retains settings and allows ${recovery}`, async ({ page }) => {
      await ready(page);
      await enterPhoto(page);
      await choose(page, "ratio", "4:5");
      await choose(page, "composition", "back");
      await page.locator("#photo-preset").selectOption("cool");
      await page.locator("#photo-resolution").selectOption("3840");
      await page.locator("#photo-exposure").focus();
      await page.keyboard.press("Home");
      for (let index = 0; index < 13; index++) await page.keyboard.press("ArrowRight");
      await expect(page.locator("#photo-exposure")).toHaveValue("1.25");
      await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.toBlob;
        globalThis.photoEncoderFailures = 0;
        HTMLCanvasElement.prototype.toBlob = function (callback) {
          HTMLCanvasElement.prototype.toBlob = original;
          globalThis.photoEncoderFailures++;
          queueMicrotask(() => callback(null));
        };
      });
      let downloads = 0;
      page.on("download", () => downloads++);
      await page.locator("#save-photo").click();
      await expect(page.locator("#photo-status")).toHaveAttribute("data-error", "true", { timeout: 90_000 });
      await expect(page.locator("#photo-status")).toContainText("설정은 그대로");
      await expect(page.locator("#save-photo")).toBeEnabled();
      await expect(page.locator("#photo-lower")).toBeVisible();
      await expect(page.locator("#photo-preset")).toHaveValue("cool");
      await expect(page.locator("#photo-resolution")).toHaveValue("3840");
      await expect(page.locator("#photo-exposure")).toHaveValue("1.25");
      await expect(page.locator('[data-setting="ratio"] [data-value="4:5"]')).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator('[data-setting="composition"] [data-value="back"]')).toHaveAttribute("aria-pressed", "true");
      expect(await page.evaluate(() => globalThis.photoEncoderFailures)).toBe(1);
      expect(downloads).toBe(0);
      const low = recovery === "lower resolution";
      const downloaded = await save(page, low ? "#photo-lower" : "#save-photo");
      const stats = await imageStats(page, downloaded.bytes);
      expect([stats.width, stats.height]).toEqual(low ? [1638, 2048] : [3072, 3840]);
      expect(downloaded.name).toContain("orbit-01-cool-back-");
      hasSubject(stats);
      await expect(page.locator("#photo-resolution")).toHaveValue(low ? "2048" : "3840");
      await expect(page.locator("#photo-exposure")).toHaveValue("1.25");
      await expect(page.locator("#photo-lower")).toBeHidden();
      expect(downloads).toBe(1);
    });
  }
});

test("photo controls and the selected canvas aspect fit 13 viewport sizes without overlap", async ({ page }) => {
  test.setTimeout(240_000);
  await ready(page);
  await enterPhoto(page);
  for (const [width, height] of viewports) {
    await test.step(`${width} × ${height}`, async () => {
      await page.setViewportSize({ width, height });
      for (const ratio of ["16:9", "1:1", "4:5"]) {
        await choose(page, "ratio", ratio);
        const layout = await page.evaluate(() => {
          const rectangle = element => {
            const value = element.getBoundingClientRect();
            return { x: value.x, y: value.y, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
          };
          const visible = element => {
            const style = getComputedStyle(element), rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          };
          const controls = [...document.querySelectorAll(".simulation button, .simulation select, .simulation input, #model-selector button")]
            .filter(visible).map(element => ({ label: element.id || element.getAttribute("aria-label") || element.textContent.trim(), ...rectangle(element) }));
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            canvas: rectangle(document.querySelector("#robot-canvas")),
            panel: rectangle(document.querySelector(".photo-panel")), controls,
          };
        });
        expect(layout.overflow, `${width}px page overflow`).toBeLessThanOrEqual(1);
        expect(layout.canvas.width).toBeGreaterThan(100);
        expect(layout.canvas.height).toBeGreaterThan(100);
        const [a, b] = ratio.split(":").map(Number);
        expect(layout.canvas.width / layout.canvas.height).toBeCloseTo(a / b, 2);
        const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1
          && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
        expect(overlaps(layout.canvas, layout.panel), "settings must not cover the photograph").toBe(false);
        for (const control of layout.controls) {
          expect(control.width, `${control.label} width at ${width}`).toBeGreaterThanOrEqual(43.5);
          expect(control.height, `${control.label} height at ${width}`).toBeGreaterThanOrEqual(43.5);
          expect(control.x, `${control.label} left edge at ${width}`).toBeGreaterThanOrEqual(-1);
          expect(control.right, `${control.label} right edge at ${width}`).toBeLessThanOrEqual(width + 1);
        }
        for (let index = 0; index < layout.controls.length; index++) {
          for (const other of layout.controls.slice(index + 1)) {
            expect(overlaps(layout.controls[index], other), `${layout.controls[index].label} overlaps ${other.label}`).toBe(false);
          }
        }
      }
    });
  }
});

test.describe("five studio subjects", () => {
  test.setTimeout(180_000);

  for (const id of models) {
    test(`${id} renders all three lighting presets and compositions with grounded contact`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await observeViewer(page);
      await ready(page, id);
      // Static inspection gives every model its authored resting pose on the
      // pedestal; moving/airborne photo preservation is covered above.
      await page.locator("#mode-inspect").click();
      await expect(page.locator("#viewer-region")).toHaveAttribute("data-mode", "inspect");
      await enterPhoto(page);
      const cells = [], fullMeans = {};
      for (const preset of presets) {
        await page.locator("#photo-preset").selectOption(preset);
        await expect(page.locator("#photo-preset")).toHaveValue(preset);
        for (const composition of compositions) {
          await choose(page, "composition", composition);
          const state = await snapshot(page);
          const shot = state.photo;
          expect(shot.minimum[1]).toBeGreaterThan(-.025);
          expect(shot.minimum[1]).toBeLessThan(.025);
          expect(shot.contact.visible).toBe(true);
          expect(shot.contact.texture).toBe(true);
          expect(shot.contact.position[1]).toBeCloseTo(.001, 6);
          expect(shot.contact.position[0]).toBeCloseTo(shot.center[0], 6);
          expect(shot.contact.position[2]).toBeCloseTo(shot.center[2], 6);
          expect(shot.pedestal[1]).toBe(0);
          expect(shot.contact.scale[0]).toBeGreaterThan(0);
          expect(shot.contact.scale[1]).toBeGreaterThan(0);
          expect(shot.camera.distance).toBeGreaterThanOrEqual(shot.camera.min - 1e-8);
          expect(shot.focusCenter, "the named detail part must exist").toBeDefined();
          if (composition === "detail") {
            shot.camera.target.forEach((value, index) => expect(value).toBeCloseTo(shot.focusCenter[index], 6));
          }
          if (composition !== "detail") for (const corner of shot.projected) {
            expect(Math.abs(corner[0])).toBeLessThan(.91);
            expect(Math.abs(corner[1])).toBeLessThan(.91);
            expect(corner[2]).toBeGreaterThan(-1);
            expect(corner[2]).toBeLessThan(1);
          }
          const image = await canvasImage(page);
          const stats = await imageStats(page, image);
          hasSubject(stats);
          if (composition === "full") fullMeans[preset] = stats.mean;
          cells.push({ label: `${id} / ${preset} / ${composition}`, png: image.toString("base64") });
        }
      }
      expect(new Set(cells.map(cell => cell.png)).size).toBe(9);
      expect(fullMeans.warm.reduce((sum, value, index) => sum + Math.abs(value - fullMeans.rim[index]), 0)).toBeGreaterThan(60);
      expect(fullMeans.warm.reduce((sum, value, index) => sum + Math.abs(value - fullMeans.cool[index]), 0)).toBeGreaterThan(3);
      await test.info().attach(`${id}-lighting-compositions`, { body: await contactSheet(page, cells), contentType: "image/png" });
      expect(errors).toEqual([]);
    });
  }
});
