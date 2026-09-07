import { CanvasTexture, RGBAFormat, Scene, Source, UnsignedByteType } from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

/** Export only model content: the original viewer scene is never reparented. */
export async function exportModel(model) {
  const exportScene = new Scene();
  exportScene.name = `${model.name}-model`;
  const materials = new Map();
  const textures = new Map();

  function exportTexture(original) {
    if (!original?.isDataTexture) return original;
    if (textures.has(original)) return textures.get(original);
    if (original.format !== RGBAFormat || original.type !== UnsignedByteType)
      throw new Error("GLB export requires RGBA unsigned-byte generated textures.");
    const { data, width, height } = original.image;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare generated textures for GLB export.");
    context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);

    // r185 converts normal-map conventions with drawImage(), which requires a
    // browser image source. Retain UV/sampler settings without sharing Source:
    // assigning image after copy() would otherwise replace the live texture.
    const converted = new CanvasTexture(canvas).copy(original);
    converted.source = new Source(canvas);
    converted.needsUpdate = true;
    textures.set(original, converted);
    return converted;
  }

  function exportMaterial(original) {
    if (materials.has(original)) return materials.get(original);
    const cloned = original.clone();
    materials.set(original, cloned);
    for (const [slot, value] of Object.entries(cloned)) {
      if (value?.isTexture) cloned[slot] = exportTexture(value);
    }
    // Texture caching keeps the shared metallic/roughness packed-map identity.
    return cloned;
  }

  try {
    const snapshot = model.clone(true);
    snapshot.traverse((object) => {
      if (object.material) object.material = Array.isArray(object.material)
        ? object.material.map(exportMaterial)
        : exportMaterial(object.material);
    });
    exportScene.add(snapshot);
    const data = await new GLTFExporter().parseAsync(exportScene, {
      binary: true,
      trs: true,
    });
    if (!(data instanceof ArrayBuffer))
      throw new Error("Expected a binary GLB file.");
    return data;
  } finally {
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => {
      texture.dispose();
      texture.image.width = texture.image.height = 1;
    });
    // Geometry and unconverted textures still belong to the live model.
    exportScene.clear();
  }
}

export function downloadGlb(data, filename = "orbit-01.glb") {
  const url = URL.createObjectURL(
    new Blob([data], { type: "model/gltf-binary" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Browsers may start consuming the URL after the click handler returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
