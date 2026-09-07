import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";

const SHADOW_SIZE = 512;
const PRESETS = {
  warm: {
    background: "#e9e5dd", floor: "#ddd8ce", pedestal: "#e8e3d9",
    key: "#fff0d8", fill: "#dcecf5", rim: "#fff6e8",
    keyPower: 5.2, fillPower: 2.6, rimPower: 4.5, environment: 0.68,
    shadow: "#55544c", shadowOpacity: 0.24,
  },
  cool: {
    background: "#dfe6ed", floor: "#cbd5df", pedestal: "#e1e8ee",
    key: "#e7f4ff", fill: "#c6deff", rim: "#fff0dc",
    keyPower: 4.8, fillPower: 3.1, rimPower: 5.0, environment: 0.68,
    shadow: "#465668", shadowOpacity: 0.22,
  },
  rim: {
    background: "#303945", floor: "#29313b", pedestal: "#46515d",
    key: "#e7edf6", fill: "#b8d6f5", rim: "#ffe0b9",
    keyPower: 2.8, fillPower: 1.6, rimPower: 11.0, environment: 0.46,
    shadow: "#1c2731", shadowOpacity: 0.26,
  },
};

let areaLightsInitialized = false;

/** Owns the studio only; subjects added to mount keep their existing ownership. */
export function createStudio(renderer) {
  if (!areaLightsInitialized) {
    RectAreaLightUniformsLib.init();
    areaLightsInitialized = true;
  }
  const scene = new THREE.Scene();
  scene.name = "studio-scene";
  const mount = new THREE.Group();
  mount.name = "studio-subject-mount";
  scene.add(mount);
  const geometries = new Set();
  const materials = new Set();
  const environments = new Map();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let disposed = false;
  let subject = null;
  let presetId = "warm";

  const ownMesh = (geometry, material, name, parent = scene) => {
    geometries.add(geometry);
    materials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    parent.add(mesh);
    return mesh;
  };
  const floorMaterial = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const floor = ownMesh(new THREE.PlaneGeometry(180, 180), floorMaterial, "studio-floor");
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.162;
  const pedestalMaterial = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.08 });
  const pedestal = ownMesh(new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.16), new THREE.Vector2(0.94, -0.16),
    new THREE.Vector2(0.986, -0.145), new THREE.Vector2(1, -0.12),
    new THREE.Vector2(1, -0.04), new THREE.Vector2(0.986, -0.012),
    new THREE.Vector2(0.94, 0), new THREE.Vector2(0, 0),
  ], 96), pedestalMaterial, "studio-pedestal");
  const pedestalShadow = ownMesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { color: { value: new THREE.Color("#4b4b44") }, opacity: { value: 0.16 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 color; uniform float opacity;
      void main() { float radius = length(vUv * 2.0 - 1.0);
        float alpha = (1.0 - smoothstep(0.68, 1.0, radius)) * opacity;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
  }), "studio-pedestal-contact");
  pedestalShadow.rotation.x = -Math.PI / 2;
  pedestalShadow.position.y = -0.161;

  const ambient = new THREE.HemisphereLight("#f7f5ed", "#858b92", 0.4);
  ambient.name = "studio-ambient";
  scene.add(ambient);
  const key = new THREE.RectAreaLight("#ffffff", 5, 5.5, 6);
  const fill = new THREE.RectAreaLight("#ffffff", 3, 4.5, 5);
  const rim = new THREE.RectAreaLight("#ffffff", 5, 3.5, 5.5);
  key.name = "studio-key-softbox";
  fill.name = "studio-fill-softbox";
  rim.name = "studio-rim-softbox";
  scene.add(key, fill, rim);

  const depthTarget = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, {
    depthBuffer: true, stencilBuffer: false,
  });
  const blurTarget = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, {
    depthBuffer: false, stencilBuffer: false,
  });
  depthTarget.texture.name = "studio-contact-shadow-map";
  blurTarget.texture.name = "studio-shadow-blur-buffer";
  depthTarget.texture.generateMipmaps = blurTarget.texture.generateMipmaps = false;
  const contactMaterial = new THREE.MeshBasicMaterial({
    map: depthTarget.texture, transparent: true, depthWrite: false,
    color: "#55544c", opacity: 0.24, toneMapped: false,
  });
  const contact = ownMesh(new THREE.PlaneGeometry(2, 2), contactMaterial, "studio-subject-contact");
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.001;
  contact.renderOrder = 2;
  contact.visible = false;

  // Geometry is shared with the subject; proxy transforms/materials are private.
  // No reparenting, visibility toggles or overrideMaterial changes touch it.
  const depthScene = new THREE.Scene();
  const proxies = new Map();
  const shadowCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.05, 8);
  shadowCamera.up.set(0, 0, -1);
  const depthMaterial = new THREE.ShaderMaterial({
    name: "studio-height-weighted-depth", blending: THREE.NoBlending,
    depthWrite: true, depthTest: true, toneMapped: false,
    uniforms: { heightFade: { value: 1.2 } },
    vertexShader: `varying float worldHeight;
      void main() {
        vec4 localPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          localPosition = instanceMatrix * localPosition;
        #endif
        vec4 worldPosition = modelMatrix * localPosition;
        worldHeight = worldPosition.y;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }`,
    fragmentShader: `varying float worldHeight; uniform float heightFade;
      void main() {
        float proximity = exp(-max(worldHeight, 0.0) / heightFade);
        gl_FragColor = vec4(vec3(1.0), 0.12 + proximity * 0.88);
      }`,
  });
  materials.add(depthMaterial);
  const blurScene = new THREE.Scene();
  const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const horizontal = new THREE.ShaderMaterial({
    ...HorizontalBlurShader,
    uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms),
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const vertical = new THREE.ShaderMaterial({
    ...VerticalBlurShader,
    uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms),
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  materials.add(vertical);
  const blurQuad = ownMesh(new THREE.PlaneGeometry(2, 2), horizontal, "studio-blur-quad", blurScene);
  blurQuad.frustumCulled = false;
  horizontal.uniforms.h.value = 1.65 / SHADOW_SIZE;
  vertical.uniforms.v.value = 1.65 / SHADOW_SIZE;
  const bounds = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  function withRendererState(render) {
    const target = renderer.getRenderTarget();
    const state = {
      target, face: renderer.getActiveCubeFace(),
      mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getCurrentViewport(new THREE.Vector4()),
      // Read Three.js's cached state. Querying GL here synchronizes the CPU
      // with the GPU on every animated contact-shadow frame.
      scissor: target ? target.scissor.clone() : renderer.getScissor(new THREE.Vector4()).multiplyScalar(renderer.getPixelRatio()).floor(),
      scissorTest: target ? target.scissorTest : renderer.getScissorTest(),
      clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear, autoClearColor: renderer.autoClearColor,
      autoClearDepth: renderer.autoClearDepth, autoClearStencil: renderer.autoClearStencil,
      toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure,
      outputColorSpace: renderer.outputColorSpace, xr: renderer.xr.enabled,
      shadowEnabled: renderer.shadowMap.enabled, shadowAuto: renderer.shadowMap.autoUpdate,
      shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
    };
    try {
      renderer.xr.enabled = false;
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      return render();
    } finally {
      renderer.autoClear = state.autoClear;
      renderer.autoClearColor = state.autoClearColor;
      renderer.autoClearDepth = state.autoClearDepth;
      renderer.autoClearStencil = state.autoClearStencil;
      renderer.toneMapping = state.toneMapping;
      renderer.toneMappingExposure = state.exposure;
      renderer.outputColorSpace = state.outputColorSpace;
      renderer.xr.enabled = state.xr;
      renderer.shadowMap.enabled = state.shadowEnabled;
      renderer.shadowMap.autoUpdate = state.shadowAuto;
      renderer.shadowMap.needsUpdate = state.shadowNeedsUpdate;
      renderer.setClearColor(state.clearColor, state.clearAlpha);
      if (state.target) {
        // setRenderTarget restores actual device-pixel viewport/scissor while
        // leaving the renderer's canvas viewport and target metadata untouched.
        const viewport = state.target.viewport.clone();
        const scissor = state.target.scissor.clone();
        const scissorTest = state.target.scissorTest;
        try {
          state.target.viewport.copy(state.viewport);
          state.target.scissor.copy(state.scissor);
          state.target.scissorTest = state.scissorTest;
          renderer.setRenderTarget(state.target, state.face, state.mip);
        } finally {
          state.target.viewport.copy(viewport);
          state.target.scissor.copy(scissor);
          state.target.scissorTest = scissorTest;
        }
      } else {
        renderer.setRenderTarget(null, state.face, state.mip);
      }
    }
  }

  function environmentFor(id) {
    if (environments.has(id)) return environments.get(id).texture;
    const preset = PRESETS[id];
    const environmentScene = new THREE.Scene();
    const environmentGeometry = new THREE.PlaneGeometry(1, 1);
    const environmentMaterials = [];
    environmentScene.background = new THREE.Color(id === "rim" ? "#161c25" : "#777d82");
    const panel = (color, power, position, dimensions) => {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide,
      });
      environmentMaterials.push(material);
      const softbox = new THREE.Mesh(environmentGeometry, material);
      softbox.position.set(...position);
      softbox.scale.set(dimensions[0], dimensions[1], 1);
      softbox.lookAt(0, 0, 0);
      environmentScene.add(softbox);
    };
    panel(preset.key, preset.keyPower * 1.1, [-4, 5, 5], [5.5, 6]);
    panel(preset.fill, preset.fillPower, [5, 2, 3], [4.5, 5]);
    panel(preset.rim, preset.rimPower, [-2, 4, -5], [3.5, 5.5]);
    panel("#ffffff", id === "rim" ? 1.8 : 3.0, [0, 7, 0], [5, 4]);
    try {
      const target = withRendererState(() => pmrem.fromScene(environmentScene, 0.045, 0.1, 40, { size: 128 }));
      target.texture.name = `studio-${id}-environment`;
      environments.set(id, target);
      return target.texture;
    } finally {
      environmentGeometry.dispose();
      environmentMaterials.forEach((material) => material.dispose());
      environmentScene.clear();
    }
  }

  function setPreset(id) {
    if (disposed) return;
    if (!PRESETS[id]) throw new RangeError(`Unknown studio preset: ${id}`);
    const preset = PRESETS[id];
    const environment = environmentFor(id);
    presetId = id;
    scene.background = new THREE.Color(preset.background);
    scene.fog = new THREE.Fog(preset.background, 24, 70);
    scene.environment = environment;
    scene.environmentIntensity = preset.environment;
    floorMaterial.color.set(preset.floor);
    pedestalMaterial.color.set(preset.pedestal);
    contactMaterial.color.set(preset.shadow);
    contactMaterial.opacity = preset.shadowOpacity;
    pedestalShadow.material.uniforms.color.value.set(preset.shadow);
    pedestalShadow.material.uniforms.opacity.value = id === "rim" ? 0.22 : 0.16;
    for (const [light, color, power] of [
      [key, preset.key, preset.keyPower], [fill, preset.fill, preset.fillPower], [rim, preset.rim, preset.rimPower],
    ]) {
      light.color.set(color);
      light.intensity = power;
    }
    ambient.intensity = id === "rim" ? 0.24 : 0.4;
  }

  function fit(nextSubject) {
    if (disposed) return;
    subject = nextSubject || null;
    if (!subject) { contact.visible = false; return; }
    subject.updateWorldMatrix(true, true);
    bounds.setFromObject(subject, true);
    if (bounds.isEmpty()) { contact.visible = false; return; }
    bounds.getSize(size);
    bounds.getCenter(center);
    const radius = Math.max(1.1, Math.hypot(size.x, size.z) * 0.5 + 0.28) / 0.94;
    pedestal.position.set(center.x, 0, center.z);
    pedestal.scale.set(radius, 1, radius);
    pedestalShadow.position.set(center.x, -0.161, center.z);
    pedestalShadow.scale.set(radius * 1.15, radius * 1.15, 1);
    const extent = radius * 1.12;
    contact.position.set(center.x, 0.001, center.z);
    contact.scale.set(extent, extent, 1);
    shadowCamera.left = shadowCamera.bottom = -extent;
    shadowCamera.right = shadowCamera.top = extent;
    const cameraHeight = Math.max(1, bounds.max.y + 0.7);
    shadowCamera.near = 0.05;
    shadowCamera.far = cameraHeight + 0.25;
    shadowCamera.position.set(center.x, cameraHeight, center.z);
    shadowCamera.lookAt(center.x, 0, center.z);
    shadowCamera.updateProjectionMatrix();
    depthMaterial.uniforms.heightFade.value = Math.max(0.3, size.y * 0.6);
    const lightScale = Math.max(1, size.length() / 4.5);
    const aim = new THREE.Vector3(center.x, Math.max(0.65, center.y), center.z);
    key.position.copy(aim).add(new THREE.Vector3(-4, 5, 5).multiplyScalar(lightScale));
    fill.position.copy(aim).add(new THREE.Vector3(5, 2, 3).multiplyScalar(lightScale));
    rim.position.copy(aim).add(new THREE.Vector3(-2, 4, -5).multiplyScalar(lightScale));
    for (const [light, width, height] of [[key, 5.5, 6], [fill, 4.5, 5], [rim, 3.5, 5.5]]) {
      light.width = width * lightScale;
      light.height = height * lightScale;
      light.lookAt(aim);
    }
    updateShadow();
  }

  function updateShadow() {
    if (disposed || !subject) return;
    subject.updateWorldMatrix(true, true);
    const current = new Set();
    subject.traverseVisible((source) => {
      if (!source.isMesh || !source.geometry) return;
      const list = Array.isArray(source.material) ? source.material : [source.material];
      if (list.every((material) => material.transmission > 0.5 || (material.transparent && !material.depthWrite))) return;
      let proxy = proxies.get(source);
      if (!proxy) {
        proxy = source.clone(false);
        proxy.name = "studio-depth-proxy";
        proxy.material = depthMaterial;
        proxy.matrixAutoUpdate = false;
        proxy.frustumCulled = false;
        proxy.castShadow = proxy.receiveShadow = false;
        proxy.layers.set(0);
        depthScene.add(proxy);
        proxies.set(source, proxy);
      }
      proxy.geometry = source.geometry;
      proxy.matrix.copy(source.matrixWorld);
      proxy.visible = true;
      current.add(source);
    });
    for (const [source, proxy] of proxies) {
      if (!current.has(source)) { depthScene.remove(proxy); proxies.delete(source); }
    }
    withRendererState(() => {
      renderer.setClearColor(0xffffff, 0);
      renderer.setRenderTarget(depthTarget);
      renderer.clear(true, true, true);
      renderer.render(depthScene, shadowCamera);
      horizontal.uniforms.tDiffuse.value = depthTarget.texture;
      blurQuad.material = horizontal;
      renderer.setRenderTarget(blurTarget);
      renderer.clear(true, false, false);
      renderer.render(blurScene, blurCamera);
      vertical.uniforms.tDiffuse.value = blurTarget.texture;
      blurQuad.material = vertical;
      renderer.setRenderTarget(depthTarget);
      renderer.clear(true, false, false);
      renderer.render(blurScene, blurCamera);
    });
    contact.visible = current.size > 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    subject = null;
    depthScene.clear();
    proxies.clear();
    blurScene.clear();
    scene.environment = null;
    environments.forEach((target) => target.dispose());
    environments.clear();
    depthTarget.dispose();
    blurTarget.dispose();
    pmrem.dispose();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    scene.remove(mount);
    scene.clear();
  }

  try {
    setPreset(presetId);
  } catch (error) {
    dispose();
    throw error;
  }
  return { scene, mount, fit, setPreset, updateShadow, dispose };
}
