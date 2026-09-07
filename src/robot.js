import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createMaterials } from "./materials.js";
import { createBoltHeadGeometry } from "./models/primitives.js";

/** All dimensions are in metres. Y is up; the soles sit at Y = 0. */
export function createRobot() {
  const robot = new THREE.Group();
  robot.name = "ORBIT-01";
  robot.userData = {
    title: "ORBIT-01",
    description: "A curious little planetary explorer",
    units: "metres",
    version: 1,
  };

  const materials = createMaterials();
  const geometryCache = new Map();
  let partNumber = 0;
  const cached = (key, create) => {
    if (!geometryCache.has(key)) geometryCache.set(key, create());
    return geometryCache.get(key);
  };
  const group = (parent, name, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const result = new THREE.Group();
    result.name = name;
    result.position.set(...position);
    result.rotation.set(...rotation);
    parent.add(result);
    return result;
  };
  const mesh = (parent, geometry, material, position, rotation, name) => {
    const result = new THREE.Mesh(geometry, material);
    result.name = name || `part-${++partNumber}`;
    result.position.set(...(position || [0, 0, 0]));
    if (rotation) result.rotation.set(...rotation);
    result.castShadow = material !== materials.glass;
    result.receiveShadow = material !== materials.glass;
    parent.add(result);
    return result;
  };
  const box = (
    parent,
    size,
    position,
    material = materials.ivory,
    radius = 0.035,
    name,
    rotation,
  ) =>
    mesh(
      parent,
      cached(
        `box:${size}:${radius}`,
        () =>
          new RoundedBoxGeometry(
            ...size,
            3,
            Math.min(radius, Math.min(...size) / 2),
          ),
      ),
      material,
      position,
      rotation,
      name,
    );
  const cylinder = (
    parent,
    radius,
    height,
    position,
    material,
    rotation,
    name,
    topRadius = radius,
  ) =>
    mesh(
      parent,
      cached(
        `cylinder:${radius}:${topRadius}:${height}`,
        () => new THREE.CylinderGeometry(topRadius, radius, height, 32),
      ),
      material,
      position,
      rotation,
      name,
    );
  const sphere = (parent, radius, position, material, name, scale) => {
    const result = mesh(
      parent,
      cached(
        `sphere:${radius}`,
        () => new THREE.SphereGeometry(radius, 32, 20),
      ),
      material,
      position,
      null,
      name,
    );
    if (scale) result.scale.set(...scale);
    return result;
  };
  const ring = (parent, radius, tube, position, material, rotation, name) =>
    mesh(
      parent,
      cached(
        `ring:${radius}:${tube}`,
        () => new THREE.TorusGeometry(radius, tube, 10, 48),
      ),
      material,
      position,
      rotation,
      name,
    );
  const capsule = (parent, radius, length, position, material, name) =>
    mesh(
      parent,
      cached(
        `capsule:${radius}:${length}`,
        () =>
          new THREE.CapsuleGeometry(
            radius,
            Math.max(0.001, length - radius * 2),
            6,
            20,
          ),
      ),
      material,
      position,
      null,
      name,
    );
  const bolt = (parent, position, back = false, radius = 0.024) => {
    const holder = group(parent, `fastener-${++partNumber}`, position, [
      0,
      back ? Math.PI : 0,
      0,
    ]);
    mesh(
      holder,
      cached(`bolt:${radius}`, () => createBoltHeadGeometry(radius)),
      materials.silver,
      [0, 0, 0],
    );
    box(
      holder,
      [radius * 1.12, radius * 0.28, 0.001],
      [0, 0, 0.0005],
      materials.graphite,
      0.001,
      undefined,
      [0, 0, 0.55],
    );
  };
  const hose = (
    parent,
    name,
    points,
    radius = 0.035,
    material = materials.rubber,
  ) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((point) => new THREE.Vector3(...point)),
    );
    return mesh(
      parent,
      new THREE.TubeGeometry(curve, 24, radius, 8, false),
      material,
      [0, 0, 0],
      null,
      name,
    );
  };
  const digits = (parent, position, scale = 1, back = false) => {
    const label = group(parent, "Serial-01", position, [
      0,
      back ? Math.PI : 0,
      0,
    ]);
    label.scale.setScalar(scale);
    box(
      label,
      [0.18, 0.26, 0.008],
      [-0.08, 0, 0],
      materials.graphite,
      0.035,
      "digit-zero",
    );
    box(
      label,
      [0.094, 0.174, 0.009],
      [-0.08, 0, 0.005],
      materials.ivory,
      0.025,
      "digit-zero-counter",
    );
    box(
      label,
      [0.048, 0.26, 0.009],
      [0.1, 0, 0],
      materials.graphite,
      0.005,
      "digit-one",
    );
    box(
      label,
      [0.06, 0.043, 0.009],
      [0.079, 0.105, 0],
      materials.graphite,
      0.004,
      "digit-one-serif",
      [0, 0, 0.55],
    );
  };

  // Main shell: a soft silhouette with separate seams, service panels and hardware.
  const torso = group(robot, "Torso", [0, 1.53, 0]);
  box(
    torso,
    [1.36, 1.15, 0.93],
    [0, 0, 0],
    materials.ivory,
    0.2,
    "main-body-shell",
  );
  box(
    torso,
    [1.13, 0.79, 0.065],
    [0, -0.035, 0.452],
    materials.graphite,
    0.13,
    "front-panel-seam",
  );
  box(
    torso,
    [1.108, 0.768, 0.055],
    [0, -0.035, 0.491],
    materials.ivory,
    0.12,
    "front-service-panel",
  );
  box(
    torso,
    [0.76, 0.075, 0.03],
    [0, 0.398, 0.443],
    materials.orange,
    0.025,
    "upper-orange-stripe",
  );
  digits(torso, [-0.24, 0.01, 0.524], 1.05);
  box(
    torso,
    [0.285, 0.027, 0.008],
    [-0.23, -0.201, 0.527],
    materials.warm,
    0.005,
    "serial-underline",
  );
  for (let i = 0; i < 3; i++) {
    cylinder(
      torso,
      0.027,
      0.015,
      [0.3, 0.13 - i * 0.09, 0.531],
      materials.graphite,
      [Math.PI / 2, 0, 0],
    );
    sphere(
      torso,
      0.016,
      [0.3, 0.13 - i * 0.09, 0.542],
      [materials.green, materials.orange, materials.warm][i],
      `status-light-${i}`,
      [1, 1, 0.48],
    );
  }
  for (let i = 0; i < 6; i++)
    box(
      torso,
      [0.039, 0.104, 0.014],
      [0.09 + i * 0.052, -0.19, 0.526],
      materials.graphite,
      0.013,
      `front-vent-${i}`,
    );
  for (const x of [-0.446, 0.446])
    for (const y of [-0.3, 0.235]) bolt(torso, [x, y, 0.531], false, 0.018);
  box(
    torso,
    [0.92, 0.105, 0.48],
    [0, -0.568, 0],
    materials.graphite,
    0.04,
    "waist-gasket",
  );
  box(
    torso,
    [0.81, 0.17, 0.49],
    [0, -0.625, -0.015],
    materials.warm,
    0.055,
    "pelvis-shell",
  );
  for (const side of [-1, 1]) {
    box(
      torso,
      [0.062, 0.51, 0.49],
      [side * 0.661, -0.025, -0.025],
      materials.orange,
      0.027,
      `side-armor-${side}`,
    );
    for (let i = 0; i < 3; i++)
      box(
        torso,
        [0.018, 0.036, 0.2],
        [side * 0.696, -0.105 + i * 0.082, -0.02],
        materials.orangeDark,
        0.009,
      );
  }

  // Short articulated legs with broad soles on a shared ground plane.
  for (const side of [-1, 1]) {
    const leg = group(
      robot,
      side < 0 ? "Leg.Left" : "Leg.Right",
      [side * 0.395, 0, 0],
      [0, side * -0.065, 0],
    );
    sphere(leg, 0.16, [0, 0.91, -0.005], materials.graphite, "hip-joint");
    cylinder(
      leg,
      0.125,
      0.27,
      [0, 0.768, -0.005],
      materials.silver,
      null,
      "upper-leg-piston",
    );
    box(
      leg,
      [0.34, 0.31, 0.35],
      [0, 0.763, 0.015],
      materials.ivory,
      0.07,
      "thigh-armor",
    );
    sphere(leg, 0.15, [0, 0.563, 0.04], materials.graphite, "knee-joint");
    cylinder(
      leg,
      0.102,
      0.05,
      [0, 0.582, 0.19],
      materials.orange,
      [Math.PI / 2, 0, 0],
      "knee-cap",
    );
    cylinder(
      leg,
      0.053,
      0.055,
      [0, 0.582, 0.219],
      materials.silver,
      [Math.PI / 2, 0, 0],
      "knee-bearing",
    );
    cylinder(
      leg,
      0.095,
      0.19,
      [0, 0.446, 0.055],
      materials.silver,
      null,
      "ankle-piston",
    );
    box(
      leg,
      [0.6, 0.11, 0.82],
      [0, 0.055, 0.17],
      materials.rubber,
      0.04,
      "ground-contact-sole",
    );
    box(
      leg,
      [0.58, 0.29, 0.77],
      [0, 0.227, 0.17],
      materials.ivory,
      0.085,
      "boot-shell",
    );
    box(
      leg,
      [0.524, 0.12, 0.067],
      [0, 0.178, 0.545],
      materials.orange,
      0.027,
      "orange-toe-bumper",
    );
    box(
      leg,
      [0.42, 0.09, 0.3],
      [0, 0.368, 0.225],
      materials.warm,
      0.029,
      "boot-instep",
    );
    for (const x of [-0.16, 0, 0.16])
      box(
        leg,
        [0.035, 0.052, 0.02],
        [x, 0.052, 0.585],
        materials.graphite,
        0.006,
        "sole-tread",
      );
    bolt(leg, [-0.188, 0.245, 0.552], false, 0.018);
    bolt(leg, [0.188, 0.245, 0.552], false, 0.018);
  }

  const neck = group(robot, "Neck", [0, 2.125, 0]);
  cylinder(
    neck,
    0.275,
    0.1,
    [0, -0.035, 0],
    materials.warm,
    null,
    "neck-collar",
  );
  cylinder(
    neck,
    0.196,
    0.14,
    [0, 0.027, 0],
    materials.graphite,
    null,
    "neck-bearing",
  );
  ring(
    neck,
    0.201,
    0.017,
    [0, 0.059, 0],
    materials.silver,
    [Math.PI / 2, 0, 0],
    "neck-trim",
  );

  // The complete head tilts around its neck, including optics and antennae.
  const head = group(robot, "Head", [0, 2.62, 0.015], [-0.025, -0.055, -0.075]);
  box(head, [1.67, 1.035, 1.0], [0, 0, 0], materials.ivory, 0.22, "head-shell");
  box(
    head,
    [1.4, 0.774, 0.055],
    [0, -0.027, 0.48],
    materials.warm,
    0.18,
    "visor-recess",
  );
  box(
    head,
    [1.34, 0.717, 0.059],
    [0, -0.016, 0.506],
    materials.graphite,
    0.165,
    "graphite-faceplate",
  );
  box(
    head,
    [0.82, 0.049, 0.08],
    [0, 0.496, -0.025],
    materials.orange,
    0.018,
    "head-crown-stripe",
  );
  for (const side of [-1, 1]) {
    const eye = group(head, side < 0 ? "Eye.Left" : "Eye.Right", [
      side * 0.356,
      0.026,
      0.531,
    ]);
    cylinder(
      eye,
      0.267,
      0.12,
      [0, 0, 0.022],
      materials.darkMetal,
      [Math.PI / 2, 0, 0],
      "optical-housing",
    );
    cylinder(
      eye,
      0.246,
      0.05,
      [0, 0, 0.096],
      materials.silver,
      [Math.PI / 2, 0, 0],
      "lens-mount",
    );
    cylinder(
      eye,
      0.228,
      0.03,
      [0, 0, 0.129],
      materials.darkMetal,
      [Math.PI / 2, 0, 0],
      "lens-bezel",
    );
    ring(eye, 0.233, 0.011, [0, 0, 0.148], materials.warm, null, "bezel-rim");
    cylinder(
      eye,
      0.215,
      0.015,
      [0, 0, 0.147],
      materials.blue,
      [Math.PI / 2, 0, 0],
      "optical-coating",
    );
    ring(
      eye,
      0.174,
      0.012,
      [0, 0, 0.161],
      materials.iris,
      null,
      "outer-optical-ring",
    );
    ring(
      eye,
      0.129,
      0.009,
      [0, 0, 0.166],
      materials.iris,
      null,
      "inner-optical-ring",
    );
    cylinder(
      eye,
      0.108,
      0.014,
      [0.008, 0.005, 0.167],
      materials.pupil,
      [Math.PI / 2, 0, 0],
      "camera-aperture",
    );
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      box(
        eye,
        [0.008, 0.026, 0.009],
        [Math.sin(angle) * 0.193, Math.cos(angle) * 0.193, 0.158],
        materials.iris,
        0.002,
        `focus-mark-${i}`,
        [0, 0, -angle],
      );
    }
    sphere(
      eye,
      0.211,
      [0, 0, 0.172],
      materials.glass,
      "convex-lens",
      [1, 1, 0.34],
    );
    sphere(
      eye,
      0.014,
      [-0.068, 0.073, 0.2355],
      materials.white,
      "lens-highlight",
      [1, 0.6, 0.065],
    );
    sphere(
      eye,
      0.005,
      [0.068, -0.055, 0.2375],
      materials.iris,
      "secondary-reflection",
      [1, 1, 0.06],
    );
    cylinder(
      head,
      0.194,
      0.07,
      [side * 0.814, 0.035, -0.015],
      materials.graphite,
      [0, 0, Math.PI / 2],
      `ear-bearing-${side}`,
    );
    cylinder(
      head,
      0.161,
      0.1,
      [side * 0.858, 0.035, -0.015],
      materials.orange,
      [0, 0, Math.PI / 2],
      `ear-shell-${side}`,
    );
    cylinder(
      head,
      0.066,
      0.112,
      [side * 0.868, 0.035, -0.015],
      materials.warm,
      [0, 0, Math.PI / 2],
      `ear-pivot-${side}`,
    );
  }
  box(
    head,
    [0.23, 0.035, 0.016],
    [0, -0.264, 0.542],
    materials.warm,
    0.012,
    "small-smile",
  );
  for (const x of [-0.607, 0.607]) bolt(head, [x, -0.23, 0.539], false, 0.017);
  for (const x of [-0.57, 0.57]) bolt(head, [x, 0.275, 0.465], false, 0.022);
  const antenna = group(head, "Antenna", [-0.55, 0.45, -0.1], [0, 0, 0.1]);
  cylinder(
    antenna,
    0.103,
    0.095,
    [0, 0.055, 0],
    materials.graphite,
    null,
    "antenna-socket",
  );
  cylinder(
    antenna,
    0.06,
    0.07,
    [0, 0.124, 0],
    materials.orange,
    null,
    "antenna-collar",
  );
  cylinder(
    antenna,
    0.021,
    0.4,
    [0, 0.32, 0],
    materials.silver,
    null,
    "antenna-mast",
  );
  cylinder(
    antenna,
    0.03,
    0.048,
    [0, 0.492, 0],
    materials.graphite,
    null,
    "antenna-tip-band",
  );
  sphere(antenna, 0.072, [0, 0.55, 0], materials.orange, "orange-antenna-tip");
  cylinder(
    head,
    0.089,
    0.07,
    [0.48, 0.5, -0.135],
    materials.warm,
    null,
    "navigation-receiver",
  );
  cylinder(
    head,
    0.057,
    0.025,
    [0.48, 0.549, -0.135],
    materials.graphite,
    null,
    "navigation-receiver-cap",
  );
  const rearHead = group(
    head,
    "Rear-head-panel",
    [0, 0, -0.491],
    [0, Math.PI, 0],
  );
  box(
    rearHead,
    [1.17, 0.57, 0.037],
    [0, -0.008, 0],
    materials.warm,
    0.11,
    "rear-service-panel",
  );
  for (let i = 0; i < 7; i++)
    box(
      rearHead,
      [0.065, 0.26, 0.013],
      [(i - 3) * 0.116, 0.035, 0.024],
      materials.graphite,
      0.02,
      `head-cooling-slot-${i}`,
    );
  for (const x of [-0.47, 0.47])
    bolt(rearHead, [x, -0.173, 0.026], false, 0.018);

  // Arms are assembled along joint-to-joint vectors, so armour never floats.
  const armSegment = (parent, name, start, end, radius, accent) => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const delta = b.clone().sub(a);
    const length = delta.length();
    const segment = group(parent, name);
    segment.position.copy(a.clone().add(b).multiplyScalar(0.5));
    segment.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    );
    cylinder(
      segment,
      radius * 0.58,
      length,
      [0, 0, 0],
      materials.silver,
      null,
      "internal-actuator",
    );
    capsule(
      segment,
      radius,
      length * 0.88,
      [0, 0, 0],
      materials.ivory,
      "arm-shell",
    );
    cylinder(
      segment,
      radius * 1.018,
      0.073,
      [0, length * 0.18, 0],
      accent ? materials.orange : materials.warm,
      null,
      "armor-band",
    );
    box(
      segment,
      [radius * 0.7, length * 0.32, 0.04],
      [0, -0.025, radius * 0.965],
      materials.warm,
      0.015,
      "arm-service-panel",
    );
    return segment;
  };
  const makeHand = (parent, name, center, rotation, waving) => {
    const hand = group(parent, name, center, rotation);
    box(
      hand,
      [0.3, 0.29, 0.185],
      [0, 0, 0],
      materials.ivory,
      0.066,
      "palm-shell",
    );
    box(
      hand,
      [0.189, 0.162, 0.02],
      [0, -0.015, 0.094],
      materials.graphite,
      0.038,
      "palm-pad",
    );
    cylinder(
      hand,
      0.041,
      0.022,
      [0, -0.012, 0.11],
      materials.orange,
      [Math.PI / 2, 0, 0],
      "palm-emblem",
    );
    for (let i = 0; i < 3; i++) {
      const finger = group(
        hand,
        `Finger-${i + 1}`,
        [(i - 1) * 0.101, 0.151, 0],
        [waving ? 0 : -0.25, 0, (1 - i) * 0.13],
      );
      sphere(finger, 0.043, [0, 0, 0], materials.graphite, "knuckle");
      capsule(
        finger,
        0.043,
        0.163,
        [0, 0.095, 0],
        materials.ivory,
        "finger-base",
      );
      cylinder(
        finger,
        0.041,
        0.023,
        [0, 0.111, 0],
        materials.graphite,
        null,
        "finger-hinge",
      );
      sphere(
        finger,
        0.043,
        [0, 0.16, 0],
        materials.warm,
        "fingertip",
        [1, 1.15, 1],
      );
    }
    const thumb = group(hand, "Thumb", [-0.153, 0.021, 0], [0, 0, 0.75]);
    sphere(thumb, 0.051, [0, 0, 0], materials.graphite, "thumb-joint");
    capsule(thumb, 0.047, 0.16, [0, 0.069, 0], materials.ivory, "thumb-shell");
  };
  for (const side of [-1, 1]) {
    const waving = side === 1;
    const arm = group(robot, waving ? "Arm.Right.Waving" : "Arm.Left");
    const shoulder = [side * 0.792, 1.9, 0];
    const elbow = waving ? [1.198, 2.13, 0.035] : [-1.027, 1.475, 0.035];
    const wrist = waving ? [1.456, 2.655, 0.13] : [-1.015, 1.12, 0.19];
    cylinder(
      arm,
      0.221,
      0.2,
      shoulder,
      materials.graphite,
      [0, 0, Math.PI / 2],
      "shoulder-bearing",
    );
    cylinder(
      arm,
      0.183,
      0.22,
      [side * 0.829, 1.9, 0],
      materials.orange,
      [0, 0, Math.PI / 2],
      "shoulder-cap",
    );
    sphere(arm, 0.152, elbow, materials.graphite, "elbow-joint");
    cylinder(
      arm,
      0.096,
      0.21,
      elbow,
      materials.silver,
      [Math.PI / 2, 0, 0],
      "elbow-axle",
    );
    cylinder(
      arm,
      0.06,
      0.026,
      [elbow[0], elbow[1], elbow[2] + 0.114],
      materials.orange,
      [Math.PI / 2, 0, 0],
      "elbow-fastener",
    );
    armSegment(arm, "Upper-arm", shoulder, elbow, 0.149, false);
    armSegment(arm, "Forearm", elbow, wrist, 0.153, true);
    sphere(arm, 0.09, wrist, materials.graphite, "wrist-joint");
    makeHand(
      arm,
      "Hand",
      waving ? [1.523, 2.817, 0.145] : [-1.015, 0.951, 0.212],
      waving ? [0, -0.09, -0.3] : [0, 0, Math.PI - 0.04],
      waving,
    );
  }

  const pack = group(robot, "Exploration-backpack", [0, 1.65, -0.623]);
  box(
    pack,
    [0.96, 0.98, 0.39],
    [0, 0, 0],
    materials.graphite,
    0.12,
    "pack-chassis",
  );
  box(
    pack,
    [0.887, 0.905, 0.22],
    [0, 0.006, -0.157],
    materials.ivory,
    0.105,
    "pack-shell",
  );
  box(
    pack,
    [0.873, 0.19, 0.236],
    [0, 0.31, -0.16],
    materials.orange,
    0.037,
    "orange-equipment-band",
  );
  const packRear = group(
    pack,
    "Backpack-service-panel",
    [0, 0, -0.28],
    [0, Math.PI, 0],
  );
  box(
    packRear,
    [0.66, 0.405, 0.02],
    [0, -0.064, 0],
    materials.warm,
    0.05,
    "thermal-panel",
  );
  for (let i = 0; i < 5; i++)
    box(
      packRear,
      [0.48, 0.028, 0.016],
      [0, 0.044 - i * 0.066, 0.017],
      materials.graphite,
      0.009,
      `pack-vent-${i}`,
    );
  for (const x of [-0.355, 0.355])
    for (const y of [-0.33, 0.24]) bolt(packRear, [x, y, 0.023], false, 0.021);
  box(
    pack,
    [0.33, 0.066, 0.1],
    [0, 0.554, -0.028],
    materials.graphite,
    0.025,
    "carry-handle",
  );
  for (const side of [-1, 1]) {
    box(
      pack,
      [0.064, 0.14, 0.1],
      [side * 0.14, 0.509, -0.028],
      materials.graphite,
      0.018,
      "handle-mount",
    );
    cylinder(
      pack,
      0.124,
      0.62,
      [side * 0.49, -0.067, -0.026],
      materials.silver,
      null,
      `reserve-cell-${side}`,
    );
    cylinder(
      pack,
      0.13,
      0.065,
      [side * 0.49, 0.231, -0.026],
      materials.orange,
      null,
      "cell-top",
    );
    cylinder(
      pack,
      0.13,
      0.065,
      [side * 0.49, -0.367, -0.026],
      materials.graphite,
      null,
      "cell-base",
    );
    hose(
      pack,
      `equipment-cable-${side}`,
      [
        [side * 0.38, -0.4, -0.01],
        [side * 0.51, -0.52, 0.05],
        [side * 0.57, -0.46, 0.16],
        [side * 0.55, -0.25, 0.21],
      ],
      0.028,
    );
  }

  // The construction coordinates above describe the original exhibition pose.
  // Add real joint pivots without changing any mesh's world-space transform.
  // Rigid groups are sufficient for the robot's metal parts; no skinning or
  // replacement geometry is needed, and the same hierarchy exports to GLB.
  const attachParts = (parent, parts) => {
    robot.updateMatrixWorld(true);
    for (const part of parts) parent.attach(part);
  };
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "Left" : "Right";
    const leg = robot.getObjectByName(`Leg.${suffix}`);
    const originalParts = [...leg.children];
    const hip = group(leg, `Hip.${suffix}`, [0, 0.91, -0.005]);
    const knee = group(hip, `Knee.${suffix}`, [0, -0.347, 0.045]);
    const ankle = group(knee, `Ankle.${suffix}`, [0, -0.212, 0.015]);
    const foot = group(ankle, `Foot.${suffix}`);
    const upperNames = new Set(["hip-joint", "upper-leg-piston", "thigh-armor"]);
    const lowerNames = new Set(["knee-joint", "knee-cap", "knee-bearing", "ankle-piston"]);
    attachParts(hip, originalParts.filter((part) => upperNames.has(part.name)));
    attachParts(knee, originalParts.filter((part) => lowerNames.has(part.name)));
    attachParts(foot, originalParts.filter((part) => !upperNames.has(part.name) && !lowerNames.has(part.name)));
    // This marker is the centre of the sole on the ground, not its mesh centre.
    group(foot, `Sole.${suffix}`, [0, -0.351, 0.115]);

    const waving = side === 1;
    const arm = robot.getObjectByName(waving ? "Arm.Right.Waving" : "Arm.Left");
    const armParts = [...arm.children];
    const shoulderPoint = new THREE.Vector3(side * 0.792, 1.9, 0);
    const elbowPoint = new THREE.Vector3(...(waving ? [1.198, 2.13, 0.035] : [-1.027, 1.475, 0.035]));
    const wristPoint = new THREE.Vector3(...(waving ? [1.456, 2.655, 0.13] : [-1.015, 1.12, 0.19]));
    const shoulder = group(arm, `Shoulder.${suffix}`, shoulderPoint.toArray());
    const elbow = group(shoulder, `Elbow.${suffix}`, elbowPoint.clone().sub(shoulderPoint).toArray());
    const wrist = group(elbow, `Wrist.${suffix}`, wristPoint.clone().sub(elbowPoint).toArray());
    const shoulderNames = new Set(["shoulder-bearing", "shoulder-cap", "Upper-arm"]);
    const elbowNames = new Set(["elbow-joint", "elbow-axle", "elbow-fastener", "Forearm"]);
    attachParts(shoulder, armParts.filter((part) => shoulderNames.has(part.name)));
    attachParts(elbow, armParts.filter((part) => elbowNames.has(part.name)));
    attachParts(wrist, armParts.filter((part) => !shoulderNames.has(part.name) && !elbowNames.has(part.name)));
  }
  const bodyParts = [...robot.children];
  const body = group(robot, "BodyRig", [0, 0.91, 0]);
  attachParts(body, bodyParts);
  robot.updateMatrixWorld(true);
  return robot;
}

/** Dispose owned resources once per root; export snapshots share their source. */
export function disposeRobot(robot) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  robot.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material)
      (Array.isArray(object.material)
        ? object.material
        : [object.material]
      ).forEach((material) => materials.add(material));
  });
  materials.forEach((material) => {
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}
