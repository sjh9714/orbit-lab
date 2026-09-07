import * as THREE from "three";
import { createKit } from "./primitives.js";
import { sampleLoop } from "./inspect-motion.js";

const INSPECT_DURATION = 10;
const SURVEY_YAW = [[0, 0], [0.8, -0.20], [2.4, -0.20], [3.7, 0.20], [5.7, 0.20], [6.8, 0], [10, 0]];
const SURVEY_PITCH = [[0, 0], [0.8, 0.035], [2.4, 0.035], [3.7, -0.025], [5.7, -0.025], [6.8, 0], [10, 0]];

/** Six-wheel geological explorer. Front faces +Z, with all tyres on Y = 0. */
export function createRover() {
  const root = new THREE.Group();
  root.name = "ROVER-02";
  root.userData = {
    title: root.name,
    description: "Six-wheel geological explorer",
    units: "metres",
    version: 1,
  };
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
  const wheels = [];

  const chassis = group(root, "Chassis", [0, 0.94, 0]);
  box(
    chassis,
    [1.52, 0.48, 1.87],
    [0, 0, 0],
    m.ivory,
    0.15,
    "rounded-monocoque",
  );
  box(
    chassis,
    [1.4, 0.085, 1.76],
    [0, -0.23, 0],
    m.graphite,
    0.035,
    "underbody-gasket",
  );
  box(
    chassis,
    [1.35, 0.095, 1.57],
    [0, 0.25, -0.02],
    m.warm,
    0.04,
    "upper-deck-seam",
  );
  for (const side of [-1, 1]) {
    box(
      chassis,
      [0.11, 0.23, 1.37],
      [side * 0.74, 0.02, -0.025],
      m.orange,
      0.04,
      `side-impact-rail-${side}`,
    );
    for (let vent = 0; vent < 5; vent++) {
      box(
        chassis,
        [0.018, 0.105, 0.043],
        [side * 0.802, 0.015, -0.42 + vent * 0.16],
        m.orangeDark,
        0.009,
        `side-cooling-slot-${side}-${vent}`,
      );
    }
  }
  const front = group(chassis, "Forward-navigation", [0, 0, 0.925]);
  box(
    front,
    [1.18, 0.265, 0.08],
    [0, 0, 0],
    m.graphite,
    0.07,
    "front-sensor-recess",
  );
  for (const side of [-1, 1]) {
    lens(front, `Hazard-camera-${side}`, [side * 0.36, 0.022, 0.05], 0.09);
    bolt(front, [side * 0.51, -0.075, 0.045], [0, 0, 0], 0.016);
    box(
      front,
      [0.245, 0.09, 0.16],
      [side * 0.44, -0.22, 0.02],
      m.orange,
      0.032,
      "front-bumper",
    );
  }
  box(
    front,
    [0.17, 0.028, 0.012],
    [0, 0.006, 0.048],
    m.green,
    0.007,
    "navigation-status-strip",
  );

  const rear = group(
    chassis,
    "Rear-service-panel",
    [0, 0.015, -0.937],
    [0, Math.PI, 0],
  );
  box(rear, [1.03, 0.265, 0.025], [0, 0, 0], m.warm, 0.042, "radiator-frame");
  for (let i = 0; i < 7; i++)
    box(
      rear,
      [0.048, 0.145, 0.018],
      [(i - 3) * 0.108, 0.005, 0.02],
      m.graphite,
      0.01,
      `radiator-fin-${i}`,
    );
  for (const side of [-1, 1]) {
    bolt(rear, [side * 0.448, -0.04, 0.022]);
    box(
      rear,
      [0.105, 0.054, 0.032],
      [side * 0.64, -0.013, 0.006],
      m.orange,
      0.015,
      "rear-marker",
    );
  }

  const suspension = group(root, "Rocker-bogie-suspension");
  for (const side of [-1, 1]) {
    cylinder(
      suspension,
      0.11,
      0.095,
      [side * 0.79, 0.78, 0],
      m.silver,
      [0, 0, Math.PI / 2],
      `rocker-pivot-${side}`,
    );
    beam(
      suspension,
      `front-rocker-${side}`,
      [side * 0.83, 0.78, 0],
      [side * 0.96, 0.39, 0.84],
      0.065,
      m.graphite,
    );
    beam(
      suspension,
      `rear-rocker-${side}`,
      [side * 0.83, 0.78, 0],
      [side * 0.94, 0.61, -0.51],
      0.065,
      m.graphite,
    );
    for (const [index, z] of [0.84, 0, -0.84].entries()) {
      const wheelName = `${side < 0 ? "Left" : "Right"}-${index + 1}`;
      if (index > 0)
        beam(
          suspension,
          `bogie-link-${wheelName}`,
          [side * 0.94, 0.61, -0.51],
          [side * 0.98, 0.39, z],
          0.052,
          m.silver,
        );
      beam(
        suspension,
        `axle-${wheelName}`,
        [side * 0.78, 0.39, z],
        [side * 1.12, 0.39, z],
        0.076,
        m.graphite,
      );
      const axle = group(
        root,
        `Wheel-${wheelName}`,
        [side * 1.04, 0.39, z],
        [0, 0, -Math.PI / 2],
      );
      const wheel = group(axle, `Tyre-assembly-${wheelName}`);
      wheels.push({ wheel, side });
      cylinder(
        wheel,
        0.355,
        0.27,
        [0, 0, 0],
        m.rubber,
        null,
        "all-terrain-tyre",
      );
      for (let tread = 0; tread < 20; tread++) {
        const angle = (tread * Math.PI) / 10;
        box(
          wheel,
          [0.071, 0.283, 0.038],
          [Math.sin(angle) * 0.355, 0, Math.cos(angle) * 0.355],
          m.graphite,
          0.005,
          `traction-cleat-${tread}`,
          [0, angle, 0],
        );
      }
      for (const face of [-1, 1]) {
        cylinder(
          wheel,
          0.245,
          0.022,
          [0, face * 0.143, 0],
          m.orange,
          null,
          "orange-wheel-rim",
        );
        cylinder(
          wheel,
          0.19,
          0.025,
          [0, face * 0.157, 0],
          m.graphite,
          null,
          "recessed-wheel-face",
        );
        ring(
          wheel,
          0.269,
          0.019,
          [0, face * 0.142, 0],
          m.rubber,
          [Math.PI / 2, 0, 0],
          "tyre-sidewall",
        );
        for (let spoke = 0; spoke < 5; spoke++) {
          const angle = spoke * Math.PI * 0.4;
          box(
            wheel,
            [0.045, 0.024, 0.165],
            [Math.sin(angle) * 0.1, face * 0.175, Math.cos(angle) * 0.1],
            m.warm,
            0.006,
            `wheel-spoke-${spoke}`,
            [0, angle, 0],
          );
        }
        cylinder(
          wheel,
          0.074,
          0.035,
          [0, face * 0.185, 0],
          m.silver,
          null,
          "hub-bearing",
        );
        cylinder(
          wheel,
          0.027,
          0.041,
          [0, face * 0.192, 0],
          m.orangeDark,
          null,
          "hub-bolt",
        );
      }
    }
  }

  const mast = group(root, "Panoramic-camera-mast", [0, 1.2, 0.37]);
  cylinder(mast, 0.2, 0.1, [0, 0.04, 0], m.graphite, null, "mast-turntable");
  cylinder(
    mast,
    0.155,
    0.07,
    [0, 0.112, 0],
    m.orange,
    null,
    "mast-base-collar",
  );
  cylinder(mast, 0.072, 0.51, [0, 0.365, 0], m.silver, null, "telescopic-mast");
  cylinder(
    mast,
    0.099,
    0.09,
    [0, 0.4, 0],
    m.graphite,
    null,
    "mast-locking-collar",
  );
  sphere(mast, 0.125, [0, 0.643, 0], m.graphite, "head-pan-joint");
  const head = group(
    mast,
    "Binocular-camera-head",
    [0, 0.84, 0.02],
    [-0.04, -0.07, -0.055],
  );
  box(
    head,
    [1.03, 0.505, 0.485],
    [0, 0, 0],
    m.ivory,
    0.13,
    "camera-head-shell",
  );
  box(
    head,
    [0.9, 0.37, 0.047],
    [0, -0.015, 0.233],
    m.graphite,
    0.11,
    "binocular-faceplate",
  );
  lens(head, "Eye.Left", [-0.24, 0, 0.26], 0.165);
  lens(head, "Eye.Right", [0.24, 0, 0.26], 0.165);
  box(
    head,
    [0.59, 0.045, 0.2],
    [0, 0.249, 0.025],
    m.orange,
    0.017,
    "camera-crown-stripe",
  );
  for (const side of [-1, 1]) {
    cylinder(
      head,
      0.116,
      0.035,
      [side * 0.504, 0, 0],
      m.orange,
      [0, 0, Math.PI / 2],
      "tilt-joint-cover",
    );
    cylinder(
      head,
      0.051,
      0.042,
      [side * 0.518, 0, 0],
      m.silver,
      [0, 0, Math.PI / 2],
      "tilt-pivot",
    );
  }
  const headRear = group(
    head,
    "Camera-rear-vents",
    [0, 0, -0.242],
    [0, Math.PI, 0],
  );
  for (let i = 0; i < 5; i++)
    box(
      headRear,
      [0.046, 0.18, 0.018],
      [(i - 2) * 0.105, 0, 0],
      m.graphite,
      0.012,
      `camera-vent-${i}`,
    );
  cylinder(
    head,
    0.041,
    0.055,
    [-0.355, 0.264, -0.08],
    m.graphite,
    null,
    "antenna-socket",
  );
  cylinder(
    head,
    0.012,
    0.32,
    [-0.355, 0.426, -0.08],
    m.silver,
    null,
    "antenna-whip",
  );
  sphere(head, 0.045, [-0.355, 0.61, -0.08], m.orange, "antenna-beacon");

  const cargo = group(root, "Science-deck", [0, 1.255, -0.4]);
  box(
    cargo,
    [1.11, 0.08, 0.68],
    [0, 0, 0],
    m.graphite,
    0.025,
    "solar-deck-frame",
  );
  for (let x = 0; x < 5; x++)
    for (let z = 0; z < 3; z++) {
      box(
        cargo,
        [0.19, 0.012, 0.178],
        [(x - 2) * 0.211, 0.047, (z - 1) * 0.201],
        m.solar,
        0.004,
        `solar-cell-${x}-${z}`,
      );
      box(
        cargo,
        [0.003, 0.003, 0.17],
        [(x - 2) * 0.211, 0.055, (z - 1) * 0.201],
        m.silver,
        0,
        "solar-busbar",
      );
    }
  for (const side of [-1, 1]) {
    const cell = group(cargo, `Sample-container-${side}`, [
      side * 0.59,
      0.075,
      0,
    ]);
    cylinder(
      cell,
      0.087,
      0.5,
      [0, 0, 0],
      m.ivory,
      [Math.PI / 2, 0, 0],
      "sample-cylinder",
    );
    for (const end of [-1, 1])
      cylinder(
        cell,
        0.093,
        0.049,
        [0, 0, end * 0.227],
        m.orange,
        [Math.PI / 2, 0, 0],
        "sample-canister-cap",
      );
    box(
      cell,
      [0.19, 0.03, 0.075],
      [0, -0.065, 0],
      m.graphite,
      0.012,
      "sample-retaining-clip",
    );
  }

  const sampler = group(root, "Sampling-arm");
  const shoulder = [-0.49, 1.2, 0.74];
  const elbow = [-0.7, 0.89, 1.11];
  const wrist = [-0.44, 0.67, 1.4];
  for (const [index, point] of [shoulder, elbow, wrist].entries())
    sphere(
      sampler,
      index === 0 ? 0.104 : 0.081,
      point,
      m.graphite,
      `sample-arm-joint-${index}`,
    );
  beam(sampler, "sample-upper-arm", shoulder, elbow, 0.074, m.ivory);
  beam(sampler, "sample-forearm", elbow, wrist, 0.057, m.orange);
  const claw = group(sampler, "Sample-gripper", wrist, [0.4, 0, 0]);
  box(
    claw,
    [0.18, 0.095, 0.15],
    [0, -0.025, 0.054],
    m.ivory,
    0.024,
    "gripper-palm",
  );
  for (const side of [-1, 1]) {
    beam(
      claw,
      "gripper-finger",
      [side * 0.075, -0.032, 0.09],
      [side * 0.09, -0.08, 0.235],
      0.026,
      m.graphite,
    );
    beam(
      claw,
      "gripper-tip",
      [side * 0.09, -0.08, 0.235],
      [side * 0.04, -0.08, 0.28],
      0.026,
      m.silver,
    );
  }

  // The optics turn around the existing spherical pan bearing, not their
  // visual centre. Reparenting preserves every mesh in the exhibition pose.
  const headPan = group(mast, "Camera-head-pan", [0, 0.643, 0]);
  root.updateWorldMatrix(true, true);
  headPan.attach(head);
  ground(root);
  const mastRotation = mast.rotation.clone();
  const tyreRadius = 0.374;
  const halfTrack = 1.04;
  let previousSpeed = 0;
  const settle = (value, target, dt) => {
    const next = THREE.MathUtils.damp(value, target, 10, dt);
    return Math.abs(next - target) < 0.00001 ? target : next;
  };

  return {
    root,
    update(dt, state) {
      if (state.mode === "inspect") {
        const angle = state.time * 1.9;
        const yaw = sampleLoop(state.time, INSPECT_DURATION, SURVEY_YAW);
        const pitch = sampleLoop(state.time, INSPECT_DURATION, SURVEY_PITCH);
        const changed = wheels.some(({ wheel }) => wheel.rotation.y !== angle)
          || !mast.rotation.equals(mastRotation)
          || headPan.rotation.y !== yaw || headPan.rotation.x !== pitch;
        wheels.forEach(({ wheel }) => { wheel.rotation.y = angle; });
        mast.rotation.copy(mastRotation);
        headPan.rotation.set(pitch, yaw, 0);
        previousSpeed = 0;
        return changed;
      }

      const speed = state.signedSpeed;
      const turnRate = state.turnRate;
      let changed = headPan.rotation.x !== 0 || headPan.rotation.y !== 0;
      headPan.rotation.set(0, 0, 0);
      for (const { wheel, side } of wheels) {
        // Every axle points along +X. A positive yaw advances the left tyres
        // and reverses the right tyres when the rover turns in place.
        const distance = (speed - side * turnRate * halfTrack) * dt;
        if (distance !== 0) {
          wheel.rotation.y += distance / tyreRadius;
          changed = true;
        }
      }

      // Let the mast lag acceleration and cornering without lifting the tyres.
      const acceleration = dt > 0 ? (speed - previousSpeed) / dt : 0;
      const pitch = mastRotation.x + THREE.MathUtils.clamp(-acceleration * 0.007, -0.04, 0.04);
      const roll = mastRotation.z + THREE.MathUtils.clamp(speed * turnRate * 0.012, -0.035, 0.035);
      const nextPitch = settle(mast.rotation.x, pitch, dt);
      const nextRoll = settle(mast.rotation.z, roll, dt);
      changed ||= nextPitch !== mast.rotation.x || nextRoll !== mast.rotation.z;
      mast.rotation.x = nextPitch;
      mast.rotation.z = nextRoll;
      previousSpeed = speed;
      return changed;
    },
    reset() {
      wheels.forEach(({ wheel }) => {
        wheel.rotation.y = 0;
      });
      mast.rotation.copy(mastRotation);
      headPan.rotation.set(0, 0, 0);
      previousSpeed = 0;
    },
  };
}
