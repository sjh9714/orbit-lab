import * as THREE from "three";
import { createKit } from "./primitives.js";
import { createExhaust } from "./flight-effects.js";
import { sampleLoop } from "./inspect-motion.js";

const INSPECT_DURATION = 12;
const RADAR_SURVEY = [[0, 0], [1.1, -0.70], [3, -0.70], [4.6, 0.62], [7.1, 0.62], [8.4, 0], [12, 0]];

/** A four-footed lunar observatory. All coordinates are metres, Y up. */
export function createLander() {
  const {
    materials: m,
    group,
    box,
    cylinder,
    sphere,
    ring,
    beam,
    bolt,
    lens,
    ground,
  } = createKit();
  const root = new THREE.Group();
  root.name = "LANDER-04";
  root.userData = {
    title: root.name,
    description: "A friendly lunar observatory with a sweeping radar dish",
    units: "metres",
    version: 1,
  };

  const body = group(root, "Lander.PressureCabin");
  cylinder(
    body,
    0.76,
    0.67,
    [0, 1.33, 0],
    m.ivory,
    null,
    "tapered-pressure-cabin",
    0.66,
  );
  sphere(body, 0.67, [0, 1.66, 0], m.ivory, "rounded-cabin-roof", [1, 0.69, 1]);
  cylinder(
    body,
    0.779,
    0.12,
    [0, 1.02, 0],
    m.orange,
    null,
    "orange-bumper-band",
    0.767,
  );
  cylinder(
    body,
    0.68,
    0.15,
    [0, 0.91, 0],
    m.graphite,
    null,
    "lower-equipment-deck",
  );
  ring(
    body,
    0.667,
    0.017,
    [0, 1.668, 0],
    m.warm,
    [Math.PI / 2, 0, 0],
    "roof-panel-seam",
  );

  const face = group(body, "Lander.Navigation", [0, 1.55, 0.606]);
  box(face, [0.9, 0.37, 0.17], [0, 0, 0], m.graphite, 0.1, "binocular-visor");
  for (const side of [-1, 1]) {
    lens(
      face,
      `navigation-camera-${side < 0 ? "left" : "right"}`,
      [side * 0.23, 0, 0.11],
      0.145,
    );
    bolt(face, [side * 0.405, 0, 0.091], undefined, 0.017);
  }
  box(
    body,
    [0.4, 0.29, 0.055],
    [0, 1.207, 0.745],
    m.warm,
    0.065,
    "front-hatch-gasket",
  );
  box(
    body,
    [0.348, 0.247, 0.035],
    [0, 1.21, 0.779],
    m.ivory,
    0.04,
    "front-access-hatch",
  );
  box(
    body,
    [0.135, 0.025, 0.025],
    [0, 1.244, 0.808],
    m.graphite,
    0.006,
    "hatch-handle",
  );
  box(
    body,
    [0.12, 0.036, 0.007],
    [0, 1.164, 0.8],
    m.orange,
    0.003,
    "hatch-safety-label",
  );
  for (const side of [-1, 1]) {
    beam(
      body,
      `boarding-rail-${side}`,
      [side * 0.15, 1.01, 0.8],
      [side * 0.15, 0.49, 0.98],
      0.025,
      m.silver,
    );
  }
  for (let i = 0; i < 3; i++) {
    const y = 0.89 - i * 0.15;
    beam(
      body,
      `boarding-rung-${i + 1}`,
      [-0.15, y, 0.842 + i * 0.052],
      [0.15, y, 0.842 + i * 0.052],
      0.025,
      m.orange,
    );
  }

  const feet = group(root, "Lander.LandingGear");
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const position = (radius, y) => [
      Math.sin(angle) * radius,
      y,
      Math.cos(angle) * radius,
    ];
    const leg = group(feet, `LandingLeg.${i + 1}`);
    const shoulder = position(0.65, 1.09);
    const knee = position(1.01, 0.59);
    const ankle = position(1.27, 0.2);
    sphere(leg, 0.12, shoulder, m.graphite, "upper-swivel");
    beam(leg, "upper-leg-tube", shoulder, knee, 0.085, m.ivory);
    sphere(leg, 0.105, knee, m.orange, "orange-knee-joint");
    beam(leg, "lower-leg-piston", knee, ankle, 0.052, m.silver);
    beam(
      leg,
      "landing-gear-brace",
      position(0.57, 0.88),
      position(1.15, 0.38),
      0.032,
      m.graphite,
    );
    sphere(leg, 0.09, ankle, m.graphite, "ankle-ball-joint");
    cylinder(
      leg,
      0.285,
      0.09,
      position(1.27, 0.045),
      m.graphite,
      null,
      "broad-foot-sole",
      0.28,
    );
    cylinder(
      leg,
      0.277,
      0.095,
      position(1.27, 0.135),
      m.orange,
      null,
      "landing-foot-dish",
      0.12,
    );
    ring(
      leg,
      0.229,
      0.012,
      position(1.27, 0.088),
      m.silver,
      [Math.PI / 2, 0, 0],
      "foot-perimeter-ring",
    );
    for (const offset of [-0.09, 0, 0.09]) {
      box(
        leg,
        [0.19, 0.014, 0.025],
        [ankle[0], 0.099, ankle[2] + offset],
        m.orangeDark,
        0.004,
        `foot-tread-${offset}`,
      );
    }
  }

  const rear = group(
    body,
    "Lander.ServiceBay",
    [0, 1.32, -0.657],
    [0, Math.PI, 0],
  );
  box(rear, [0.74, 0.45, 0.12], [0, 0, 0], m.warm, 0.065, "rear-service-panel");
  for (let i = 0; i < 6; i++) {
    box(
      rear,
      [0.047, 0.23, 0.025],
      [-0.17 + i * 0.068, 0, 0.07],
      m.graphite,
      0.01,
      `radiator-slot-${i + 1}`,
    );
  }
  for (const x of [-0.3, 0.3])
    for (const y of [-0.145, 0.145]) bolt(rear, [x, y, 0.068]);
  for (const side of [-1, 1]) {
    const tank = group(body, `Lander.OxygenTank.${side}`, [
      side * 0.668,
      1.35,
      -0.125,
    ]);
    cylinder(tank, 0.125, 0.34, [0, 0, 0], m.warm, null, "tank-canister");
    sphere(tank, 0.125, [0, 0.17, 0], m.warm, "tank-upper-dome", [1, 0.6, 1]);
    sphere(tank, 0.125, [0, -0.17, 0], m.warm, "tank-lower-dome", [1, 0.6, 1]);
    for (const y of [-0.1, 0.1])
      cylinder(
        tank,
        0.133,
        0.04,
        [0, y, 0],
        m.orange,
        null,
        "tank-retaining-band",
      );
  }

  const mast = group(root, "Lander.RadarMast", [0, 2.075, -0.055]);
  cylinder(mast, 0.1, 0.115, [0, 0, 0], m.orange, null, "radar-base");
  cylinder(mast, 0.04, 0.21, [0, 0.105, 0], m.silver, null, "radar-mast");
  const sweep = group(mast, "Lander.RadarSweep", [0, 0.26, 0]);
  const dish = group(sweep, "Lander.RadarDish", [0, 0, 0], [0.65, 0, 0]);
  // Keep the spherical joint and its spindle behind the reflecting surface.
  const gimbalPosition = new THREE.Vector3(0, -0.105, 0)
    .applyQuaternion(dish.quaternion).add(sweep.position);
  sphere(mast, 0.062, gimbalPosition.toArray(), m.graphite, "radar-gimbal");
  const dishGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.1, 0.012),
      new THREE.Vector2(0.21, 0.046),
      new THREE.Vector2(0.32, 0.106),
      new THREE.Vector2(0.43, 0.19),
    ],
    48,
  );
  const dishMaterial = m.ivory.clone();
  dishMaterial.name = "Lander double-sided ceramic radar reflector";
  dishMaterial.side = THREE.DoubleSide;
  const reflector = new THREE.Mesh(dishGeometry, dishMaterial);
  reflector.name = "parabolic-radar-reflector";
  reflector.castShadow = true;
  reflector.receiveShadow = true;
  dish.add(reflector);
  ring(
    dish,
    0.43,
    0.023,
    [0, 0.19, 0],
    m.orange,
    [Math.PI / 2, 0, 0],
    "reflector-orange-rim",
  );
  cylinder(
    dish,
    0.08,
    0.04,
    [0, -0.025, 0],
    m.graphite,
    null,
    "reflector-mount",
  );
  cylinder(dish, 0.033, 0.105, [0, -0.065, 0], m.silver, null, "reflector-rear-spindle");
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    beam(
      dish,
      `feed-support-${i + 1}`,
      [Math.cos(angle) * 0.37, 0.152, Math.sin(angle) * 0.37],
      [0, 0.35, 0],
      0.015,
      m.silver,
    );
  }
  cylinder(
    dish,
    0.049,
    0.105,
    [0, 0.35, 0],
    m.blue,
    null,
    "radar-feed-horn",
    0.027,
  );
  sphere(dish, 0.026, [0, 0.411, 0], m.iris, "radar-feed-indicator");

  const antenna = group(
    body,
    "Lander.TelemetryAntenna",
    [-0.43, 1.89, -0.2],
    [0, 0, 0.18],
  );
  cylinder(
    antenna,
    0.055,
    0.075,
    [0, 0, 0],
    m.graphite,
    null,
    "telemetry-base",
  );
  cylinder(
    antenna,
    0.015,
    0.49,
    [0, 0.25, 0],
    m.silver,
    null,
    "telemetry-whip",
  );
  sphere(antenna, 0.04, [0, 0.508, 0], m.orange, "telemetry-tip");

  const engine = group(root, "Lander.HopThruster");
  cylinder(engine, 0.17, 0.15, [0, 0.775, 0], m.graphite, null, "hop-thruster-plenum");
  cylinder(engine, 0.12, 0.12, [0, 0.66, 0], m.silver, null, "hop-thruster-neck");
  cylinder(engine, 0.21, 0.19, [0, 0.555, 0], m.graphite, null, "hop-thruster-nozzle", 0.12);
  cylinder(engine, 0.174, 0.008, [0, 0.457, 0], m.pupil, null, "hop-thruster-aperture");
  ring(engine, 0.206, 0.015, [0, 0.46, 0], m.silver, [Math.PI / 2, 0, 0], "hop-thruster-lip");
  ground(root);

  // A slight whole-assembly compression keeps the fixed landing struts attached
  // and every foot on the same ground plane throughout crouch and touchdown.
  const assembly = new THREE.Group();
  assembly.name = "Lander.MotionAssembly";
  for (const child of [...root.children]) assembly.add(child);
  root.add(assembly);
  const effects = new THREE.Group();
  effects.name = "Lander.RuntimeEffects";
  effects.position.copy(root.position);
  effects.visible = false;
  const exhaustAssembly = group(effects, "Lander.ExhaustAssembly");
  const exhaust = createExhaust("Lander.HopExhaust", 0.17, 0.95);
  exhaust.root.position.set(0, 0.452, 0);
  exhaustAssembly.add(exhaust.root);

  return {
    root,
    effects,
    update(dt, state) {
      const control = state.mode === "control";
      const time = state.time;
      const step = Math.min(Math.max(dt, 0), 0.05);
      const landing = control ? THREE.MathUtils.clamp(state.landing, 0, 1) : 0;
      const crouch = control ? THREE.MathUtils.clamp(state.crouch, 0, 1) : 0;
      assembly.scale.y = control
        ? THREE.MathUtils.damp(assembly.scale.y, 1 - landing * 0.03 - crouch * 0.018, 17, step)
        : 1;
      sweep.rotation.y = control
        ? Math.sin(time * 1.05) * 0.95
        : sampleLoop(time, INSPECT_DURATION, RADAR_SURVEY);
      const dishTilt = control ? THREE.MathUtils.clamp(state.verticalSpeed * 0.013, -0.05, 0.05) : 0;
      dish.rotation.x = control
        ? THREE.MathUtils.damp(dish.rotation.x, 0.65 - dishTilt + landing * 0.035, 9, step)
        : 0.65;
      exhaustAssembly.scale.copy(assembly.scale);
      effects.visible = control;
      const thrust = control && !state.grounded
        ? THREE.MathUtils.clamp(state.thrust, 0, 1)
        : 0;
      // The plume ends above the floor even during a very low propulsion hop.
      const clearance = Math.max(0, state.position.y + 0.452 * assembly.scale.y - 0.035);
      exhaust.setPower(thrust, time, clearance / assembly.scale.y);
      return true;
    },
    reset() {
      assembly.scale.set(1, 1, 1);
      sweep.rotation.y = 0;
      dish.rotation.x = 0.65;
      exhaustAssembly.scale.set(1, 1, 1);
      effects.visible = false;
      exhaust.setPower(0);
    },
  };
}
