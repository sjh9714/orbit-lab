import * as THREE from "three";

const TEXTURE_SIZE = 128;
const PAINT_SEED = 0x4f524249;
const METAL_SEED = 0x544c4142;

function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function surfaceField(seed, brushed = false) {
  const random = randomSource(seed);
  const size = TEXTURE_SIZE;
  const fine = Float32Array.from({ length: size * size }, random);
  const rows = Float32Array.from({ length: size }, random);
  const field = new Float32Array(fine.length);
  const sample = (x, y) => fine[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      field[index] = brushed
        ? rows[y] * 0.78 + fine[index] * 0.22
        : fine[index] * 0.5 + (sample(x - 1, y) + sample(x + 1, y)
          + sample(x, y - 1) + sample(x, y + 1)) * 0.125;
    }
  }
  return field;
}

function texture(name, data, repeat) {
  const result = new THREE.DataTexture(
    data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType,
  );
  result.name = name;
  result.colorSpace = THREE.NoColorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(...repeat);
  result.magFilter = THREE.LinearFilter;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.generateMipmaps = true;
  result.anisotropy = 4;
  result.needsUpdate = true;
  return result;
}

function roughnessTexture(name, field, midpoint, variation, repeat) {
  const data = new Uint8Array(field.length * 4);
  for (let index = 0; index < field.length; index++) {
    const offset = index * 4;
    data[offset] = 255;
    data[offset + 1] = Math.round(midpoint + (field[index] - 0.5) * variation);
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
  return texture(name, data, repeat);
}

function normalTexture(name, field, repeat) {
  const size = TEXTURE_SIZE;
  const data = new Uint8Array(field.length * 4);
  const sample = (x, y) => field[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (sample(x - 1, y) - sample(x + 1, y)) * 1.4;
      const ny = (sample(x, y - 1) - sample(x, y + 1)) * 1.4;
      const inverseLength = 1 / Math.hypot(nx, ny, 1);
      const offset = (y * size + x) * 4;
      data[offset] = Math.round((nx * inverseLength * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((ny * inverseLength * 0.5 + 0.5) * 255);
      data[offset + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }
  return texture(name, data, repeat);
}

/** Every call owns its textures and materials; no resources cross model instances. */
export function createMaterials() {
  const paint = surfaceField(PAINT_SEED);
  const brushed = surfaceField(METAL_SEED, true);
  const paintRoughness = roughnessTexture("Enamel packed roughness", paint, 237, 24, [8, 8]);
  const paintNormal = normalTexture("Enamel microtexture normal", paint, [8, 8]);
  const metalRoughness = roughnessTexture("Brushed metal packed roughness", brushed, 230, 30, [6, 10]);
  const metalNormal = normalTexture("Brushed metal microgrooves normal", brushed, [6, 10]);
  const rubberRoughness = roughnessTexture("Rubber grain packed roughness", paint, 248, 12, [8, 8]);

  // G carries roughness and B stays white. Sharing this packed texture between
  // both map slots preserves the metalness factor and exports DataTexture
  // directly, without GLTFExporter's canvas-only map-compositing path.
  const finish = (roughnessMap, normalMap, normalStrength) => ({
    roughnessMap,
    metalnessMap: roughnessMap,
    normalMap,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
  });
  const standard = (name, color, roughness, metalness, extra = {}) =>
    new THREE.MeshStandardMaterial({ name, color, roughness, metalness, ...extra });
  const enamel = (name, color, roughness, clearcoat) =>
    new THREE.MeshPhysicalMaterial({
      name, color, roughness, metalness: 0.08,
      clearcoat, clearcoatRoughness: 0.24,
      clearcoatRoughnessMap: paintRoughness,
      ...finish(paintRoughness, paintNormal, 0.09),
    });

  return {
    ivory: enamel("Ivory painted metal", "#eee9da", 0.37, 0.3),
    warm: enamel("Warm ceramic panels", "#ddd6c1", 0.48, 0.12),
    orange: enamel("Expedition orange", "#d96032", 0.35, 0.36),
    orangeDark: standard("Recessed orange", "#9b3a1d", 0.49, 0.12,
      finish(paintRoughness, paintNormal, 0.06)),
    graphite: standard("Graphite mechanical parts", "#353d3d", 0.43, 0.56,
      finish(metalRoughness, metalNormal, 0.05)),
    rubber: standard("Soft charcoal rubber", "#232b2c", 0.96, 0,
      finish(rubberRoughness, paintNormal, 0.16)),
    silver: standard("Brushed titanium", "#afb7b1", 0.32, 0.91,
      finish(metalRoughness, metalNormal, 0.075)),
    darkMetal: standard("Lens barrel anodised metal", "#1c3038", 0.29, 0.74,
      finish(metalRoughness, metalNormal, 0.045)),
    blue: standard("Deep blue optical coating", "#124963", 0.19, 0.6),
    iris: standard("Azure optical rings", "#4cacc1", 0.25, 0.55, {
      emissive: "#167d99", emissiveIntensity: 0.08,
    }),
    pupil: standard("Optical aperture", "#051921", 0.2, 0.12),
    glass: new THREE.MeshPhysicalMaterial({
      name: "Blue coated lens glass", color: "#c4e2e9",
      roughness: 0.055, metalness: 0, transmission: 0.92,
      thickness: 0.12, ior: 1.46, clearcoat: 0.9, clearcoatRoughness: 0.04,
    }),
    green: standard("Ready indicator", "#c6df9c", 0.28, 0.1, {
      emissive: "#8faa60", emissiveIntensity: 0.42,
    }),
    white: standard("Optical catchlight", "#cfe5e7", 0.19, 0.1, {
      emissive: "#a0bbbf", emissiveIntensity: 0.02,
    }),
    solar: standard("Blue photovoltaic cells", "#123955", 0.3, 0.58),
  };
}
