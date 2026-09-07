import * as THREE from "three";
import { createKit } from "./primitives.js";
import { createExhaust } from "./flight-effects.js";
import { sampleLoop } from "./inspect-motion.js";

const INSPECT_DURATION = 12;
const PANEL_TRACK = [[0, 0], [1.4, 0.26], [5, 0.26], [6.6, -0.12], [10, -0.12], [11.2, 0], [12, 0]];
const DISH_YAW = [[0, 0], [2, 0], [2.7, -0.10], [3.6, -0.10], [4.3, 0], [7.4, 0], [8.1, 0.08], [8.7, 0.08], [9.4, 0], [12, 0]];
const DISH_PITCH = [[0, 0], [2, 0], [2.7, 0.035], [3.6, 0.035], [4.3, 0], [7.4, 0], [8.1, -0.025], [8.7, -0.025], [9.4, 0], [12, 0]];

/** A compact orbital relay whose solar wings track the sun around real hinges. */
export function createSatellite() {
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
  root.name = "RELAY-05";
  root.userData = {
    title: root.name,
    description: "An orbital relay with articulated solar wings",
    units: "metres",
    version: 1,
  };

  const body = group(root, "Satellite.InstrumentBus", [0, 1.15, 0]);
  box(
    body,
    [0.94, 1.23, 0.84],
    [0, 0, 0],
    m.ivory,
    0.13,
    "main-instrument-housing",
  );
  box(
    body,
    [0.95, 0.18, 0.85],
    [0, -0.33, 0],
    m.orange,
    0.065,
    "orange-equipment-belt",
  );
  box(body, [0.82, 0.07, 0.74], [0, 0.6, 0], m.graphite, 0.03, "top-deck-seal");
  box(
    body,
    [0.79, 0.095, 0.69],
    [0, 0.655, 0],
    m.warm,
    0.025,
    "top-equipment-deck",
  );
  box(
    body,
    [0.72, 0.61, 0.045],
    [0, 0.16, 0.423],
    m.warm,
    0.055,
    "front-instrument-plate",
  );
  lens(body, "Satellite.StarTracker", [-0.135, 0.245, 0.48], 0.185);
  box(
    body,
    [0.122, 0.22, 0.038],
    [0.205, 0.24, 0.468],
    m.graphite,
    0.025,
    "telemetry-indicator-plate",
  );
  for (let i = 0; i < 3; i++)
    sphere(
      body,
      0.025,
      [0.205, 0.306 - i * 0.068, 0.495],
      [m.green, m.iris, m.orange][i],
      `telemetry-light-${i + 1}`,
      [1, 1, 0.55],
    );
  box(
    body,
    [0.39, 0.078, 0.017],
    [-0.06, -0.08, 0.459],
    m.graphite,
    0.018,
    "front-data-port",
  );
  for (let i = 0; i < 4; i++)
    box(
      body,
      [0.014, 0.042, 0.008],
      [-0.176 + i * 0.075, -0.08, 0.472],
      m.silver,
      0.003,
      `data-port-pin-${i + 1}`,
    );
  for (const x of [-0.288, 0.288])
    for (const y of [-0.081, 0.405]) bolt(body, [x, y, 0.452]);

  const radiator = group(
    body,
    "Satellite.RearRadiator",
    [0, 0, -0.419],
    [0, Math.PI, 0],
  );
  box(
    radiator,
    [0.72, 0.97, 0.06],
    [0, 0.04, 0],
    m.graphite,
    0.04,
    "radiator-frame",
  );
  for (let i = 0; i < 9; i++)
    box(
      radiator,
      [0.64, 0.053, 0.058],
      [0, -0.3 + i * 0.084, 0.059],
      m.silver,
      0.011,
      `radiator-fin-${i + 1}`,
    );
  for (const x of [-0.305, 0.305])
    for (const y of [-0.385, 0.455]) bolt(radiator, [x, y, 0.042]);

  const engine = group(root, "Satellite.MainThruster", [0, 0.42, 0]);
  cylinder(
    engine,
    0.215,
    0.22,
    [0, 0.01, 0],
    m.graphite,
    null,
    "thruster-plenum",
    0.265,
  );
  cylinder(
    engine,
    0.185,
    0.13,
    [0, -0.145, 0],
    m.silver,
    null,
    "thruster-neck",
    0.17,
  );
  cylinder(
    engine,
    0.29,
    0.21,
    [0, -0.305, 0],
    m.graphite,
    null,
    "main-nozzle-bell",
    0.18,
  );
  cylinder(
    engine,
    0.235,
    0.013,
    [0, -0.416, 0],
    m.pupil,
    null,
    "main-nozzle-aperture",
  );
  ring(
    engine,
    0.284,
    0.018,
    [0, -0.41, 0],
    m.silver,
    [Math.PI / 2, 0, 0],
    "nozzle-lip",
  );
  for (const side of [-1, 1]) {
    const rcs = group(
      body,
      `Satellite.AttitudeThruster.${side}`,
      [side * 0.45, -0.39, 0.2],
      [0, 0, (side * -Math.PI) / 2],
    );
    cylinder(
      rcs,
      0.095,
      0.13,
      [0, 0.04, 0],
      m.graphite,
      null,
      "attitude-thruster-mount",
    );
    cylinder(
      rcs,
      0.07,
      0.11,
      [0, 0.15, 0],
      m.silver,
      null,
      "attitude-nozzle",
      0.105,
    );
    cylinder(
      rcs,
      0.081,
      0.005,
      [0, 0.21, 0],
      m.pupil,
      null,
      "attitude-nozzle-aperture",
    );
  }

  const wings = [];
  for (const side of [-1, 1]) {
    const label = side < 0 ? "Left" : "Right";
    const hingePosition = [side * 0.64, 1.26, 0];
    beam(
      root,
      `${label}-fixed-wing-standoff`,
      [side * 0.43, 1.26, 0],
      hingePosition,
      0.065,
      m.silver,
    );
    const hinge = group(root, `Satellite.SolarHinge.${label}`, hingePosition);
    cylinder(
      hinge,
      0.075,
      0.45,
      [0, 0, 0],
      m.graphite,
      null,
      "vertical-hinge-axle",
    );
    for (const y of [-0.195, 0.195])
      cylinder(
        hinge,
        0.088,
        0.07,
        [0, y, 0],
        m.orange,
        null,
        "hinge-bearing-collar",
      );
    const wing = group(
      hinge,
      `Satellite.SolarWing.${label}`,
      [0, 0, 0],
      [0, side * 0.08, 0],
    );
    wings.push({ wing, side });
    const center = side * 0.905;
    for (const y of [-0.15, 0.15])
      beam(
        wing,
        `panel-yoke-${y}`,
        [0, y, 0],
        [side * 0.29, y * 1.8, 0],
        0.038,
        m.silver,
      );
    box(
      wing,
      [1.28, 1.56, 0.072],
      [center, 0, 0],
      m.graphite,
      0.028,
      "solar-wing-frame",
    );
    box(
      wing,
      [1.16, 1.44, 0.018],
      [center, 0, 0.047],
      m.solar,
      0.008,
      "blue-photovoltaic-sheet",
    );
    // The visible cell grid is geometry, so the exported GLB needs no image files.
    for (let i = 1; i < 6; i++)
      box(
        wing,
        [0.013, 1.43, 0.006],
        [center - 0.58 + (i * 1.16) / 6, 0, 0.06],
        m.silver,
        0.002,
        `cell-column-${i}`,
      );
    for (let i = 1; i < 8; i++)
      box(
        wing,
        [1.15, 0.012, 0.006],
        [center, -0.72 + (i * 1.44) / 8, 0.06],
        m.silver,
        0.002,
        `cell-row-${i}`,
      );
    for (const x of [-0.61, 0.61])
      for (const y of [-0.745, 0.745])
        box(
          wing,
          [0.1, 0.085, 0.083],
          [center + x, y, 0],
          m.orange,
          0.014,
          `frame-corner-${x}-${y}`,
        );
    box(
      wing,
      [1.14, 1.41, 0.016],
      [center, 0, -0.048],
      m.warm,
      0.014,
      "solar-wing-rear-insulation",
    );
    for (const offset of [-0.4, 0, 0.4])
      box(
        wing,
        [0.042, 1.44, 0.03],
        [center + offset, 0, -0.065],
        m.graphite,
        0.006,
        `rear-rib-${offset}`,
      );
    beam(
      wing,
      "rear-diagonal-brace",
      [center - 0.53, -0.65, -0.078],
      [center + 0.53, 0.65, -0.078],
      0.022,
      m.silver,
    );
  }

  const communications = group(root, "Satellite.Communications", [0, 1.855, 0]);
  cylinder(
    communications,
    0.105,
    0.12,
    [0, -0.025, 0],
    m.graphite,
    null,
    "dish-pedestal",
  );
  const dish = group(
    communications,
    "Satellite.HighGainDish",
    [0, 0.16, 0],
    [0.78, 0, -0.18],
  );
  const gimbalPosition = new THREE.Vector3(0, -0.115, 0)
    .applyQuaternion(dish.quaternion).add(dish.position);
  sphere(communications, 0.075, gimbalPosition.toArray(), m.orange, "dish-gimbal");
  const reflectorGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.12, 0.014),
      new THREE.Vector2(0.25, 0.056),
      new THREE.Vector2(0.38, 0.13),
      new THREE.Vector2(0.48, 0.21),
    ],
    48,
  );
  const reflectorMaterial = m.ivory.clone();
  reflectorMaterial.name = "Satellite double-sided high-gain reflector";
  reflectorMaterial.side = THREE.DoubleSide;
  const reflector = new THREE.Mesh(reflectorGeometry, reflectorMaterial);
  reflector.name = "high-gain-reflector";
  reflector.castShadow = reflector.receiveShadow = true;
  dish.add(reflector);
  ring(
    dish,
    0.48,
    0.026,
    [0, 0.21, 0],
    m.orange,
    [Math.PI / 2, 0, 0],
    "high-gain-dish-rim",
  );
  cylinder(dish, 0.095, 0.035, [0, -0.02, 0], m.graphite, null, "high-gain-rear-mount");
  cylinder(dish, 0.035, 0.12, [0, -0.075, 0], m.silver, null, "high-gain-rear-spindle");
  beam(dish, "feed-horn-mast", [0, 0.015, 0], [0, 0.33, 0], 0.022, m.silver);
  sphere(dish, 0.068, [0, 0.34, 0], m.blue, "high-gain-feed", [1, 0.64, 1]);
  for (const side of [-1, 1]) {
    const antenna = group(body, `Satellite.OmnidirectionalAntenna.${side}`, [
      side * 0.28,
      0.6,
      -0.27,
    ]);
    beam(
      antenna,
      "antenna-boom",
      [0, 0, 0],
      [side * 0.13, 0.7, -0.08],
      0.018,
      m.silver,
    );
    sphere(antenna, 0.036, [side * 0.13, 0.7, -0.08], m.orange, "antenna-tip");
  }

  for (const side of [-1, 1]) {
    const thruster = group(root, `Satellite.TranslationThruster.${side}`, [0, 0.65, side * 0.405], [side * Math.PI / 2, 0, 0]);
    cylinder(thruster, 0.08, 0.08, [0, 0.025, 0], m.graphite, null, "translation-thruster-mount");
    cylinder(thruster, 0.058, 0.09, [0, 0.108, 0], m.silver, null, "translation-nozzle", 0.084);
    cylinder(thruster, 0.066, 0.005, [0, 0.155, 0], m.pupil, null, "translation-nozzle-aperture");
  }
  const dishQuaternion = dish.quaternion.clone();
  ground(root);

  // Rotate around the instrument bus, while the actor owns world position/yaw.
  const centerHeight = 1.15;
  const assembly = new THREE.Group();
  assembly.name = "Satellite.AttitudeAssembly";
  assembly.position.y = centerHeight;
  for (const child of [...root.children]) {
    child.position.y -= centerHeight;
    assembly.add(child);
  }
  root.add(assembly);
  const effects = new THREE.Group();
  effects.name = "Satellite.RuntimeEffects";
  effects.position.copy(root.position);
  effects.visible = false;
  const exhaustAssembly = group(effects, "Satellite.ExhaustAssembly", [0, centerHeight, 0]);
  const mainExhaust = createExhaust("Satellite.MainExhaust", 0.23, 0.8);
  mainExhaust.root.position.set(0, 0.001 - centerHeight, 0);
  exhaustAssembly.add(mainExhaust.root);
  const maneuveringExhausts = [];
  for (const side of [-1, 1]) {
    const lateral = createExhaust(`Satellite.LateralExhaust.${side}`, 0.07, 0.43);
    lateral.root.position.set(side * 0.663, 0.76 - centerHeight, 0.2);
    lateral.root.rotation.z = side * Math.PI / 2;
    exhaustAssembly.add(lateral.root);
    const longitudinal = createExhaust(`Satellite.LongitudinalExhaust.${side}`, 0.058, 0.48);
    longitudinal.root.position.set(0, 0.65 - centerHeight, side * 0.565);
    longitudinal.root.rotation.x = -side * Math.PI / 2;
    exhaustAssembly.add(longitudinal.root);
    maneuveringExhausts.push({ side, lateral, longitudinal });
  }

  return {
    root,
    effects,
    update(dt, state) {
      const control = state.mode === "control";
      const time = state.time;
      const step = Math.min(Math.max(dt, 0), 0.05);
      const sine = Math.sin(state.heading);
      const cosine = Math.cos(state.heading);
      const localX = cosine * state.velocity.x - sine * state.velocity.z;
      const localZ = sine * state.velocity.x + cosine * state.velocity.z;
      const pitch = control ? THREE.MathUtils.clamp(localZ / 2.2 * 0.085, -0.085, 0.085) : 0;
      const roll = control ? THREE.MathUtils.clamp(-localX / 2.2 * 0.085 - state.turnRate * 0.025, -0.11, 0.11) : 0;
      assembly.rotation.x = control ? THREE.MathUtils.damp(assembly.rotation.x, pitch, 5, step) : 0;
      assembly.rotation.z = control ? THREE.MathUtils.damp(assembly.rotation.z, roll, 5, step) : 0;
      const panelAngle = control ? Math.sin(time * 0.85) * 0.43 : sampleLoop(time, INSPECT_DURATION, PANEL_TRACK);
      for (const { wing, side } of wings)
        wing.rotation.y = side * (0.08 + panelAngle);
      dish.quaternion.copy(dishQuaternion);
      if (!control) {
        // The dish only adjusts while the panel actuators hold their angle.
        dish.rotateY(sampleLoop(time, INSPECT_DURATION, DISH_YAW));
        dish.rotateX(sampleLoop(time, INSPECT_DURATION, DISH_PITCH));
      }
      exhaustAssembly.rotation.copy(assembly.rotation);
      effects.visible = control;
      const thrust = control ? THREE.MathUtils.clamp(state.thrust, 0, 1) : 0;
      const verticalPower = state.verticalSpeed > 0.02 ? 0.95 : state.verticalSpeed < -0.02 ? 0.22 : 0.48;
      mainExhaust.setPower(thrust * verticalPower, time);
      for (const { side, lateral, longitudinal } of maneuveringExhausts) {
        lateral.setPower(thrust * THREE.MathUtils.clamp(-side * (localX / 2.2 + state.turnRate * 0.45), 0, 1), time);
        longitudinal.setPower(thrust * THREE.MathUtils.clamp(-side * localZ / 2.2, 0, 1), time);
      }
      return true;
    },
    reset() {
      assembly.rotation.set(0, 0, 0);
      for (const { wing, side } of wings) wing.rotation.y = side * 0.08;
      dish.quaternion.copy(dishQuaternion);
      exhaustAssembly.rotation.set(0, 0, 0);
      effects.visible = false;
      mainExhaust.setPower(0);
      for (const { lateral, longitudinal } of maneuveringExhausts) {
        lateral.setPower(0);
        longitudinal.setPower(0);
      }
    },
  };
}
