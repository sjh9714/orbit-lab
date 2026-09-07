import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { disposeRobot } from "./robot.js";
import { createMotion, createStepper } from "./motion.js";
import { createInput } from "./input.js";
import { createTerrain } from "./terrain.js";
import { createStudio } from './studio.js';
import { createPhotoSession, createPhotoRenderer, photoDefaults } from './photo.js';
import { modelDefinitions } from './catalog.js';

export function createViewer(canvas, onContextLost, onStateChange = () => {}, panel) {
  const scene = new THREE.Scene();
  const actor = new THREE.Group();
  actor.name = "controlled-actor";
  scene.add(actor);
  const terrain = createTerrain();
  scene.add(terrain);
  const followTarget = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const contactSize = new THREE.Vector2(1, 1);
  scene.background = new THREE.Color("#eae8e1");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 70);
  const studio = createStudio(renderer);
  const photoRenderer = createPhotoRenderer(renderer);
  const photoSettings = { ...photoDefaults };
  let photograph = null;
  let returnMode = 'control';
  let liveViewport;
  let capturing = false;
  let studioDirty = true;

  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.035);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.62;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight("#f7f4e8", "#9da28f", 1.35));
  const key = new THREE.DirectionalLight("#fff3df", 2.7);
  key.position.set(-3.5, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -10;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 40;
  key.shadow.normalBias = 0.024;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 5;
  key.target.position.set(0, 1.5, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight("#d8e9ee", 1.4);
  fill.position.set(5, 3, -4);
  scene.add(fill);

  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.ShadowMaterial({
    color: "#4a5342",
    opacity: 0.19,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.name = "studio-ground";
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.012;
  ground.receiveShadow = true;
  scene.add(ground);

  // A procedural feathered contact shadow supplements the directional shadow.
  // Vertex alpha keeps this studio-only element free of external textures.
  const contactGeometry = new THREE.RingGeometry(0, 1, 64, 12);
  const colors = [];
  const positions = contactGeometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const radius = Math.hypot(positions.getX(i), positions.getY(i));
    colors.push(
      0.28,
      0.31,
      0.24,
      Math.pow(Math.max(0, 1 - radius), 2.2) * 0.19,
    );
  }
  contactGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 4),
  );
  const contactMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const contact = new THREE.Mesh(contactGeometry, contactMaterial);
  contact.name = "studio-contact-shadow";
  contact.rotation.x = -Math.PI / 2;
  contact.scale.set(1.35, 0.95, 1);
  contact.position.set(0.05, -0.006, 0.09);
  scene.add(contact);

  const controls = new OrbitControls(camera, canvas);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  controls.enableDamping = !reducedMotion.matches;
  controls.dampingFactor = 0.12;
  controls.enablePan = false;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.autoRotateSpeed = 1.5;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 2 + 0.035;
  controls.cursorStyle = "grab";
  const homeDirection = new THREE.Vector3(4.4, 2.3, 8.5).normalize();
  const homeTarget = new THREE.Vector3();
  const modelBounds = new THREE.Box3();
  let current = null;
  let homeDistance = 8;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let playing = false;
  let elapsed = 0;
  let mode = 'control';
  let paused = false;
  let motion = null;
  let modelId = 'orbit';
  let lastReport = 0;
  let input;
  const stepper = createStepper((dt) => {
    if (mode === 'control') {
      cameraForward.copy(controls.target).sub(camera.position).setY(0).normalize();
      const state = motion.step(dt, input.read(), cameraForward);
      current.update(dt, state);
      actor.position.set(state.position.x, state.position.y, state.position.z);
      actor.rotation.y = state.heading;
      followTarget.copy(homeTarget).add(actor.position);
      const offset = followTarget.clone().sub(controls.target);
      camera.position.add(offset);
      controls.target.copy(followTarget);
    } else {
      elapsed += dt;
      current.update(dt, { ...motion.state, mode: 'inspect', time: elapsed });
    }
    renderer.shadowMap.needsUpdate = true;
    studioDirty = true;
  });
  let lastFrame = 0;
  let disposed = false;
  let interrupted = false;
  let frame = 0;

  const reportState = () => onStateChange({
    playing, paused, mode, autoRotate: controls.autoRotate,
    motion: motion?.state, photo: { ...photoSettings }, capturing,
  });
  function updateLighting() {
    const p = actor.position;
    key.position.set(p.x - 3.5, p.y + 8, p.z + 5);
    key.target.position.copy(homeTarget).add(p);
    contact.position.set(p.x + homeTarget.x, -0.006, p.z + homeTarget.z);
    const spread = 1 + p.y * 0.18;
    contact.scale.set(contactSize.x * spread, contactSize.y * spread, 1);
    contactMaterial.opacity = 1 / (1 + p.y * 0.55);
  }
  function requestRender() {
    if (!frame && !capturing && !disposed && !interrupted && !document.hidden)
      frame = requestAnimationFrame(render);
  }
  function render(now) {
    frame = 0;
    if (disposed || interrupted || capturing || document.hidden) return;
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;
    if (current && ((mode === 'control' && !paused) || (mode === 'inspect' && playing))) {
      stepper.advance(delta);
      updateLighting();
    }
    if (mode === 'photo') photograph.controls.update(delta);
    else controls.update(delta);
    if (mode !== 'control' && studioDirty) { studio.updateShadow(); studioDirty = false; }
    if (mode === 'photo') photoRenderer.render(studio.scene, photograph.camera, photoSettings.exposure);
    else renderer.render(mode === 'control' ? scene : studio.scene, camera);
    if (now - lastReport > 100) { reportState(); lastReport = now; }
    if ((mode === 'control' && !paused) || playing || controls.autoRotate) requestRender();
  }
  controls.addEventListener("change", requestRender);

  // Project every model-bound corner into the camera basis. Reserve room at
  // the bottom for controls instead of assuming every model is robot-shaped.
  function fittingDistance(direction, aspect, viewportHeight) {
    const right = new THREE.Vector3()
      .crossVectors(camera.up, direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * aspect;
    const lowerLimit = mode === "control"
      ? Math.max(0.35, 1 - 144 / viewportHeight)
      : Math.max(0.25, 1 - 208 / viewportHeight);
    let distance = 0.5;
    for (const x of [modelBounds.min.x, modelBounds.max.x]) {
      for (const y of [modelBounds.min.y, modelBounds.max.y]) {
        for (const z of [modelBounds.min.z, modelBounds.max.z]) {
          const relative = new THREE.Vector3(x, y, z).sub(homeTarget);
          const depth = relative.dot(direction);
          const vertical = relative.dot(up);
          distance = Math.max(
            distance,
            depth + Math.abs(relative.dot(right)) / (tanH * 0.87),
            depth +
              Math.abs(vertical) / (tanV * (vertical >= 0 ? 0.88 : lowerLimit)),
          );
        }
      }
    }
    return distance * 1.025;
  }

  function stopCameraMotion() {
    // Disabling OrbitControls leaves its damping deltas intact. Drain them
    // without changing the displayed view so a paused/photo camera stays put.
    const position = camera.position.clone();
    const target = controls.target.clone();
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    camera.updateMatrixWorld(true);
    controls.enableDamping = damping;
  }

  function resetView() {
    if (!current) return;
    if (photograph) { setPhotoSettings({ composition: 'full' }); return; }
    playing = false;
    elapsed = 0;
    lastFrame = 0;
    current.reset();
    motion?.reset();
    input?.clear();
    stepper.reset();
    paused = false;
    actor.position.set(0, mode === 'control' && modelId === 'satellite' ? 1.5 : 0, 0);
    actor.rotation.set(0, 0, 0);
    updateLighting();
    controls.autoRotate = false;
    controls.enableDamping = false;
    controls.update();
    controls.target.copy(homeTarget).add(actor.position);
    camera.position
      .copy(controls.target)
      .addScaledVector(homeDirection, homeDistance);
    controls.update();
    controls.enableDamping = !reducedMotion.matches;
    renderer.shadowMap.needsUpdate = true;
    studioDirty = true;
    reportState();
    requestRender();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || disposed) return;
    const nextPixelRatio = Math.min(window.devicePixelRatio, 2);
    if (rect.width === width && rect.height === height) {
      if (pixelRatio !== nextPixelRatio) {
        pixelRatio = nextPixelRatio;
        renderer.setPixelRatio(pixelRatio);
        requestRender();
      }
      return;
    }
    if (photograph) {
      width = rect.width; height = rect.height; pixelRatio = nextPixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      photograph.setAspect(width / height);
      requestRender();
      return;
    }
    const direction = camera.position.clone().sub(controls.target).normalize();
    const previousFit =
      current && width && height
        ? fittingDistance(direction, width / height, height)
        : 0;
    const zoomRatio = previousFit
      ? camera.position.distanceTo(controls.target) / previousFit
      : 1;
    width = rect.width;
    height = rect.height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    pixelRatio = nextPixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    if (current) {
      homeDistance = fittingDistance(homeDirection, camera.aspect, height);
      controls.maxDistance = homeDistance * 2.6;
      const distance = THREE.MathUtils.clamp(
        fittingDistance(direction, camera.aspect, height) * zoomRatio,
        controls.minDistance,
        controls.maxDistance,
      );
      camera.position
        .copy(controls.target)
        .addScaledVector(direction, distance);
      controls.update();
    }
    requestRender();
  }

  function setModel(model, id = 'orbit') {
    const wasPhoto = Boolean(photograph);
    if (wasPhoto) closePhoto();
    input?.clear();
    if (current) {
      actor.remove(current.root);
      disposeRobot(current.root);
      if (current.effects) { actor.remove(current.effects); disposeRobot(current.effects); }
    }
    actor.position.set(0,0,0);
    actor.rotation.set(0,0,0);
    current = model;
    modelId = id;
    current.reset();
    actor.add(current.root);
    if (current.effects) actor.add(current.effects);
    actor.updateMatrixWorld(true);
    modelBounds.setFromObject(current.root);
    const size = modelBounds.getSize(new THREE.Vector3());
    modelBounds.getCenter(homeTarget);
    homeTarget.y -= size.y * 0.09;
    const horizontalRadius = Math.max(
      Math.hypot(modelBounds.min.x, modelBounds.min.z),
      Math.hypot(modelBounds.max.x, modelBounds.max.z),
      Math.hypot(modelBounds.max.x, modelBounds.min.z),
      Math.hypot(modelBounds.min.x, modelBounds.max.z),
    ) * 1.08 + 0.1;
    motion = createMotion(id, horizontalRadius);
    const radius = modelBounds.getBoundingSphere(new THREE.Sphere()).radius;
    controls.minDistance = Math.max(0.75, radius * 1.25);
    homeDistance = fittingDistance(homeDirection, camera.aspect, height || 500);
    controls.maxDistance = homeDistance * 2.6;
    camera.far = Math.max(100, controls.maxDistance * 2);
    camera.updateProjectionMatrix();
    contactSize.set(Math.max(0.65,size.x*0.5), Math.max(0.55,size.z*0.7));
    resetView();
    if (mode === 'inspect') { studio.fit(actor); studioDirty = true; }
    if (wasPhoto) enterPhoto();
  }
  function setMode(value) {
    if (capturing) return;
    if (value === 'photo') { enterPhoto(); return; }
    if (!['control','inspect'].includes(value)) return;
    if (photograph) { closePhoto(); if (mode === value) return; }
    mode = value;
    (mode === 'control' ? scene : studio.mount).add(actor);
    terrain.visible = mode === 'control';
    ground.visible = mode === 'inspect';
    scene.background.set(mode === 'control' ? '#dbccb4' : '#eae8e1');
    scene.fog = mode === 'control' ? new THREE.Fog('#dbccb4',25,65) : null;
    controls.maxPolarAngle = mode === 'control' ? Math.PI / 2 - 0.08 : Math.PI / 2 + 0.035;
    homeDistance = fittingDistance(homeDirection, camera.aspect, height || 500);
    controls.maxDistance = homeDistance * 2.6;
    camera.far = Math.max(100, controls.maxDistance * 2);
    camera.updateProjectionMatrix();
    resetView();
    if (mode === 'inspect') { studio.fit(actor); studioDirty = true; }
  }
  function enterPhoto() {
    if (!current || photograph || capturing) return;
    returnMode = mode;
    liveViewport = { width, height };
    input?.clear();
    stepper.reset(); lastFrame = 0;
    paused = true; playing = false; controls.autoRotate = false;
    stopCameraMotion();
    controls.enabled = false;
    photograph = createPhotoSession(current.root, actor, modelDefinitions.find(item => item.id === modelId)?.photo, canvas, requestRender, studio.scene.getObjectByName('studio-pedestal'));
    if (actor.parent === studio.mount) actor.removeFromParent();
    studio.mount.add(photograph.subject);
    studio.fit(photograph.subject);
    photograph.compose('full');
    studioDirty = true;
    photoSettings.composition = 'full';
    mode = 'photo';
    const [x, y] = photoSettings.ratio.split(':').map(Number);
    photograph.setAspect(x / y);
    photograph.compose('full');
    reportState();
    requestRender();
  }
  function closePhoto() {
    if (!photograph || capturing) return;
    photograph.dispose(); photograph = null;
    mode = returnMode;
    (mode === 'control' ? scene : studio.mount).add(actor);
    controls.enabled = true;
    width = liveViewport.width; height = liveViewport.height;
    renderer.setSize(width, height, false);
    // The live camera and model have not been updated during the shoot.
    // Leaving a shoot always requires an explicit movement/play action.
    paused = true; playing = false; lastFrame = 0; stepper.reset(); input?.clear();
    if (mode === 'inspect') studio.fit(actor);
    studioDirty = true;
    // Report first so layout returns to its previous canvas dimensions.
    reportState();
    requestRender();
  }
  function setPhotoSettings(next) {
    if (capturing) return;
    const oldRatio = photoSettings.ratio;
    Object.assign(photoSettings, next);
    if (next.preset) { studio.setPreset(next.preset); studioDirty = true; }
    if (photograph) {
      if (next.ratio && oldRatio !== next.ratio) {
        const [x, y] = next.ratio.split(':').map(Number);
        photograph.setAspect(x / y);
        photograph.compose(photoSettings.composition);
      }
      if (next.composition) photograph.compose(next.composition);
    }
    reportState(); requestRender();
  }
  async function capturePhoto() {
    if (!photograph || capturing) throw new Error('Photo mode unavailable');
    capturing = true;
    photograph.controls.enabled = false;
    cancelAnimationFrame(frame); frame = 0;
    reportState();
    try {
      if (studioDirty) { studio.updateShadow(); studioDirty = false; }
      return await photoRenderer.capture(studio.scene, photograph.camera, photoSettings);
    } finally {
      capturing = false;
      if (photograph) photograph.controls.enabled = true;
      reportState(); requestRender();
    }
  }
  function setPaused(value) {
    if (mode !== 'control') return;
    paused = Boolean(value);
    if (paused) stopCameraMotion();
    input?.clear();
    lastFrame = 0;
    stepper.reset();
    reportState();
    requestRender();
  }
  function setPlaying(value) {
    if (!current || photograph) return;
    playing = Boolean(value);
    lastFrame = 0;
    reportState();
    requestRender();
  }
  function setAutoRotate(value) {
    controls.autoRotate = mode === 'inspect' && Boolean(value);
    lastFrame = 0;
    reportState();
    requestRender();
  }
  function zoom(direction) {
    const activeControls = photograph?.controls || controls;
    if (direction > 0) activeControls.dollyIn(0.86);
    else activeControls.dollyOut(0.86);
    requestRender();
  }
  const onInspectKey = (event) => {
    if (capturing) return;
    const moves = {
      '+': ['dollyIn',0.9], '=': ['dollyIn',0.9], '-': ['dollyOut',0.9],
      ...(mode !== 'control' ? { ArrowLeft:['rotateLeft',.13], ArrowRight:['rotateLeft',-.13], ArrowUp:['rotateUp',.1], ArrowDown:['rotateUp',-.1] } : {}),
    };
    if (mode === 'inspect' && event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) setPlaying(!playing);
    } else if (moves[event.key]) {
      event.preventDefault();
      const [method,amount] = moves[event.key]; (photograph?.controls || controls)[method](amount); requestRender();
    }
  };
  input = createInput(canvas, panel, {
    isControl: () => mode === 'control',
    onInput: () => { if (paused) { paused = false; lastFrame = 0; reportState(); } requestRender(); },
    onReset: resetView,
    onInspectKey,
    onPause: () => { if (mode === 'control') setPaused(true); else { setPlaying(false); setAutoRotate(false); } },
  });
  const focusCanvas = () => canvas.focus({ preventScroll: true });
  canvas.addEventListener('pointerdown', focusCanvas);
  const handleContextLost = (event) => {
    event.preventDefault();
    interrupted = true;
    cancelAnimationFrame(frame);
    frame = 0;
    onContextLost?.();
  };
  const handleVisibility = () => {
    lastFrame = 0;
    if (document.hidden) {
      input.clear();
      if (mode === 'control') setPaused(true);
      else { setPlaying(false); setAutoRotate(false); }
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  };
  const handleMotionPreference = () => {
    controls.enableDamping = !reducedMotion.matches;
    if (reducedMotion.matches) {
      if (mode === 'control') setPaused(true);
      setPlaying(false);
      setAutoRotate(false);
    }
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  window.addEventListener("resize", resize);

  canvas.addEventListener("webglcontextlost", handleContextLost);
  document.addEventListener("visibilitychange", handleVisibility);
  reducedMotion.addEventListener("change", handleMotionPreference);
  ground.visible = false;
  scene.background.set('#dbccb4');
  scene.fog = new THREE.Fog('#dbccb4',25,65);
  controls.maxPolarAngle = Math.PI / 2 - 0.08;
  resize();

  return {
    get model() {
      return photograph?.root || current?.root;
    },
    setModel,
    setMode,
    setPaused,
    resetView,
    setPlaying,
    setAutoRotate,
    zoom,
    closePhoto,
    setPhotoSettings,
    capturePhoto,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleMotionPreference);
      input.dispose();
      canvas.removeEventListener('pointerdown', focusCanvas);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      photograph?.dispose();
      studio.dispose();
      photoRenderer.dispose();
      if (current) { disposeRobot(current.root); if (current.effects) disposeRobot(current.effects); }
      disposeRobot(terrain);
      groundGeometry.dispose();
      groundMaterial.dispose();
      contactGeometry.dispose();
      contactMaterial.dispose();
      key.shadow.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
