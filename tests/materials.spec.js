import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { createMaterials } from "../src/materials.js";
import { disposeRobot } from "../src/robot.js";

const mapsOf = (materials) => new Set(materials.flatMap((material) =>
  Object.values(material).filter((value) => value?.isTexture),
));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("shared finishes use reproducible textures with independent model ownership and one-time disposal", () => {
  const first = createMaterials();
  const second = createMaterials();
  const firstMaps = mapsOf(Object.values(first));
  const secondMaps = mapsOf(Object.values(second));
  const expectedNames = {
    ivory: "Ivory painted metal", orange: "Expedition orange",
    silver: "Brushed titanium", rubber: "Soft charcoal rubber",
    glass: "Blue coated lens glass",
  };
  for (const [key, name] of Object.entries(expectedNames)) expect(first[key].name).toBe(name);
  expect(first.ivory.isMeshPhysicalMaterial).toBe(true);
  expect(first.orange.isMeshPhysicalMaterial).toBe(true);
  expect(first.ivory.clearcoat).toBeGreaterThan(0);
  expect(first.rubber.roughness).toBeGreaterThan(0.9);
  expect(first.glass.transmission).toBe(0.92);
  expect(first.glass.ior).toBe(1.46);
  expect(firstMaps.size).toBeGreaterThanOrEqual(4);

  for (const [key, material] of Object.entries(first)) {
    expect(material).not.toBe(second[key]);
    for (const slot of ["normalMap", "roughnessMap", "metalnessMap", "clearcoatRoughnessMap"]) {
      const map = material[slot];
      if (!map) continue;
      const other = second[key][slot];
      expect(map).not.toBe(other);
      expect(map.image.data).not.toBe(other.image.data);
      expect(digest(map.image.data)).toBe(digest(other.image.data));
      expect(map.isDataTexture).toBe(true);
      expect(map.image.data).toBeInstanceOf(Uint8Array);
      expect(map.format).toBe(THREE.RGBAFormat);
      expect(map.type).toBe(THREE.UnsignedByteType);
      expect(map.colorSpace).toBe(THREE.NoColorSpace);
      expect([128, 256]).toContain(map.image.width);
      expect(map.image.height).toBe(map.image.width);
      expect(map.image.data.length).toBe(map.image.width * map.image.height * 4);
    }
    if (material.roughnessMap) {
      expect(material.roughnessMap).toBe(material.metalnessMap);
      const pixels = material.roughnessMap.image.data;
      let packedCorrectly = true;
      for (let index = 0; index < pixels.length; index += 4)
        packedCorrectly &&= pixels[index + 2] === 255 && pixels[index + 3] === 255;
      expect(packedCorrectly).toBe(true);
    }
  }
  for (const map of firstMaps) {
    const greenValues = new Set();
    for (let index = 1; index < map.image.data.length; index += 4)
      greenValues.add(map.image.data[index]);
    expect(greenValues.size, `${map.name} should contain actual surface variation`).toBeGreaterThan(4);
  }

  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  for (const material of [...Object.values(first), first.ivory.clone()])
    root.add(new THREE.Mesh(geometry, material));
  const disposed = new Map([...firstMaps, ...secondMaps].map((map) => [map, 0]));
  for (const map of disposed.keys())
    map.addEventListener("dispose", () => disposed.set(map, disposed.get(map) + 1));
  disposeRobot(root);
  for (const map of firstMaps) expect(disposed.get(map)).toBe(1);
  for (const map of secondMaps) expect(disposed.get(map)).toBe(0);
  secondMaps.forEach((map) => map.dispose());
  Object.values(second).forEach((material) => material.dispose());
});

for (const id of ["orbit", "rover", "drone", "lander", "satellite"]) {
  test(`${id}: GLB preserves generated texture pixels, material roles and the current articulated pose`, async ({ page }) => {
    // Test the real browser exporter/loader without starting the live viewer.
    await page.route("**/material-export-test", (route) => route.fulfill({
      contentType: "text/html", body: "<!doctype html><title>Material export check</title>",
    }));
    await page.goto("/material-export-test");
    const result = await page.evaluate(async (modelId) => {
      const { Box3 } = await import("/node_modules/three/src/math/Box3.js");
      const { GLTFLoader } = await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js");
      const { createModel } = await import("/src/catalog.js");
      const { createMotion } = await import("/src/motion.js");
      const { exportModel } = await import("/src/export.js");
      const { disposeRobot } = await import("/src/robot.js");
      const source = createModel(modelId);
      let restoredScene;
      const mapSlots = ["normalMap", "roughnessMap", "metalnessMap", "clearcoatRoughnessMap"];
      const numericProperties = ["roughness", "metalness", "clearcoat", "clearcoatRoughness", "transmission", "ior", "thickness"];
      const mapCache = new Map();

      async function describeMap(map, normalScale) {
        const flipX = Boolean(normalScale && normalScale.x < 0);
        const flipY = Boolean(normalScale && normalScale.y < 0);
        const cacheKey = `${map.uuid}:${flipX}:${flipY}`;
        if (mapCache.has(cacheKey)) return mapCache.get(cacheKey);
        const pending = (async () => {
          const image = map.image;
          let pixels;
          if (image.data) pixels = image.data;
          else {
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context.drawImage(image, 0, 0);
            pixels = context.getImageData(0, 0, image.width, image.height).data;
          }
          // r185 flips normal G when exporting meshes without tangents, then
          // GLTFLoader compensates with negative normalScale.y. Compare the
          // canonical signed normal pixels so that either half going missing
          // fails, while accepting the correctly preserved surface direction.
          if (flipX || flipY) {
            pixels = new Uint8Array(pixels);
            for (let index = 0; index < pixels.length; index += 4) {
              if (flipX) pixels[index] = 255 - pixels[index];
              if (flipY) pixels[index + 1] = 255 - pixels[index + 1];
            }
          }
          const hash = await crypto.subtle.digest("SHA-256", pixels);
          return {
            width: image.width, height: image.height,
            bytes: pixels.byteLength,
            sha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
            type: map.type, format: map.format, colorSpace: map.colorSpace,
            wrapS: map.wrapS, wrapT: map.wrapT, repeat: map.repeat.toArray(),
            offset: map.offset.toArray(), rotation: map.rotation, flipY: map.flipY,
          };
        })();
        mapCache.set(cacheKey, pending);
        return pending;
      }

      async function describe(root) {
        root.updateMatrixWorld(true);
        const nodes = [];
        const entries = [];
        const seen = new Set();
        let triangles = 0;
        root.traverse((node) => {
          const path = [];
          for (let ancestor = node; ancestor !== root; ancestor = ancestor.parent)
            path.unshift(ancestor.parent.children.indexOf(ancestor));
          const key = path.join("/");
          nodes.push({
            key, name: node.userData.name || node.name,
            children: node.children.length, matrix: node.matrixWorld.toArray(),
          });
          if (!node.isMesh) return;
          triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
          const list = Array.isArray(node.material) ? node.material : [node.material];
          list.forEach((material, index) => {
            if (!seen.has(material)) {
              seen.add(material);
              entries.push({ key: `${key}:${index}`, material });
            }
          });
        });
        const materials = await Promise.all(entries.map(async ({ key, material }) => ({
          key, name: material.name, type: material.type,
          values: Object.fromEntries(numericProperties.map((property) => [property, material[property] ?? null])),
          normalScale: material.normalScale?.toArray().map(Math.abs) ?? null,
          maps: Object.fromEntries(await Promise.all(mapSlots.filter((slot) => material[slot]).map(async (slot) =>
            [slot, await describeMap(material[slot], slot === "normalMap" ? material.normalScale : null)]))),
        })));
        const bounds = new Box3().setFromObject(root);
        return { nodes, triangles, materials, bounds: [...bounds.min.toArray(), ...bounds.max.toArray()] };
      }

      try {
        source.reset();
        const rest = await describe(source.root);
        const baseState = createMotion(modelId).state;
        source.update(1 / 60, { ...baseState, mode: "inspect", time: 0.83 });
        const original = await describe(source.root);
        const poseChanged = original.nodes.some((node, index) =>
          node.matrix.some((value, element) => Math.abs(value - rest.nodes[index].matrix[element]) > 1e-5));
        const parent = source.root.parent;
        const binary = await exportModel(source.root);
        const header = new DataView(binary);
        const jsonLength = header.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(binary, 20, jsonLength)));
        const gltf = await new GLTFLoader().parseAsync(binary, "");
        restoredScene = gltf.scene;
        const restored = await describe(restoredScene.children[0]);
        const sourceAfterExport = await describe(source.root);
        return {
          original, restored, poseChanged,
          sourceUnchanged: source.root.parent === parent
            && JSON.stringify(original.nodes) === JSON.stringify(sourceAfterExport.nodes),
          magic: header.getUint32(0, true), version: header.getUint32(4, true),
          byteLength: binary.byteLength, declaredLength: header.getUint32(8, true),
          sceneChildren: restoredScene.children.length,
          embeddedImages: (json.images || []).map((image) => ({
            mimeType: image.mimeType, embedded: Number.isInteger(image.bufferView), uri: image.uri ?? null,
          })),
        };
      } finally {
        disposeRobot(source.root);
        if (source.effects) disposeRobot(source.effects);
        if (restoredScene) disposeRobot(restoredScene);
      }
    }, id);

    expect(result.magic).toBe(0x46546c67);
    expect(result.version).toBe(2);
    expect(result.declaredLength).toBe(result.byteLength);
    expect(result.sceneChildren).toBe(1);
    expect(result.poseChanged).toBe(true);
    expect(result.sourceUnchanged).toBe(true);
    expect(result.embeddedImages.length).toBeGreaterThanOrEqual(4);
    for (const image of result.embeddedImages) {
      expect(image).toEqual({ mimeType: "image/png", embedded: true, uri: null });
    }
    expect(result.restored.triangles).toBe(result.original.triangles);
    expect(result.restored.nodes).toHaveLength(result.original.nodes.length);
    result.original.nodes.forEach((original, index) => {
      const restored = result.restored.nodes[index];
      expect(restored.key).toBe(original.key);
      expect(restored.name).toBe(original.name);
      expect(restored.children).toBe(original.children);
      original.matrix.forEach((value, element) => expect(restored.matrix[element]).toBeCloseTo(value, 5));
    });
    result.original.bounds.forEach((value, index) => expect(result.restored.bounds[index]).toBeCloseTo(value, 5));
    expect(result.restored.materials).toHaveLength(result.original.materials.length);
    result.original.materials.forEach((original, index) => {
      const restored = result.restored.materials[index];
      expect(restored.key).toBe(original.key);
      expect(restored.name).toBe(original.name);
      expect(restored.type).toBe(original.type);
      expect(restored.normalScale).toEqual(original.normalScale);
      for (const [property, value] of Object.entries(original.values)) {
        if (value === null) expect(restored.values[property]).toBeNull();
        else expect(restored.values[property]).toBeCloseTo(value, 6);
      }
      // Compare decoded RGBA bytes (canonical signed bytes for normal maps).
      // Slot names also catch a map being dropped or assigned wrongly.
      expect(restored.maps, `${original.name} texture roles and decoded pixels`).toEqual(original.maps);
    });
  });
}
