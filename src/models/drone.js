import * as THREE from "three";
import { createKit } from "./primitives.js";
import { sampleLoop } from "./inspect-motion.js";

const INSPECT_DURATION = 10;
const GIMBAL_YAW = [[0, 0], [0.7, -0.09], [2, -0.09], [3.2, 0.085], [4.6, 0.085], [5.8, 0], [10, 0]];
const GIMBAL_PITCH = [[0, 0], [0.7, 0.035], [2, 0.035], [3.2, -0.025], [4.6, -0.025], [5.8, 0], [10, 0]];

/** Guarded quad-rotor survey craft, presented resting on its landing skids. */
export function createDrone() {
  const root = new THREE.Group();
  root.name = "SCOUT-03";
  root.userData = {
    title: root.name,
    description: "Quad-rotor aerial survey companion",
    units: "metres",
    version: 1,
  };
  const {
    materials: m,
    group,
    mesh,
    box,
    cylinder,
    sphere,
    ring,
    beam,
    bolt,
    lens,
    ground,
  } = createKit();
  const propellers = [];

  const hull = group(root, "Flight-body", [0, 1.14, 0]);
  box(
    hull,
    [0.91, 0.42, 1.075],
    [0, 0, 0],
    m.ivory,
    0.19,
    "rounded-flight-shell",
  );
  box(
    hull,
    [0.865, 0.075, 1.017],
    [0, -0.08, 0],
    m.graphite,
    0.13,
    "body-midline-gasket",
  );
  box(
    hull,
    [0.867, 0.148, 1.007],
    [0, -0.155, 0],
    m.warm,
    0.09,
    "lower-avionics-shell",
  );
  box(
    hull,
    [0.48, 0.034, 0.72],
    [0, 0.213, -0.035],
    m.orange,
    0.075,
    "orange-flight-controller-lid",
  );
  box(
    hull,
    [0.29, 0.021, 0.27],
    [0, 0.235, -0.04],
    m.ivory,
    0.04,
    "top-ceramic-badge",
  );
  for (let i = 0; i < 3; i++)
    box(
      hull,
      [0.043, 0.018, 0.12],
      [(i - 1) * 0.072, 0.25, -0.04],
      m.graphite,
      0.006,
      `top-badge-mark-${i}`,
    );
  for (const side of [-1, 1]) {
    const sidePanel = group(
      hull,
      `Avionics-panel-${side}`,
      [side * 0.455, 0.015, -0.06],
      [0, (side * Math.PI) / 2, 0],
    );
    for (let i = 0; i < 4; i++)
      box(
        sidePanel,
        [0.044, 0.107, 0.016],
        [(i - 1.5) * 0.087, 0, 0],
        m.graphite,
        0.01,
        `avionics-cooling-slot-${i}`,
        [0, 0, -0.15],
      );
    bolt(sidePanel, [-0.24, 0.02, -0.015], [0, 0, 0], 0.017);
    bolt(sidePanel, [0.24, 0.02, -0.015], [0, 0, 0], 0.017);
    sphere(
      hull,
      0.039,
      [side * 0.363, 0.012, 0.445],
      side < 0 ? m.green : m.orange,
      "navigation-light",
      [1, 0.62, 0.65],
    );
  }
  const tail = group(
    hull,
    "Battery-access",
    [0, -0.006, -0.521],
    [0, Math.PI, 0],
  );
  box(
    tail,
    [0.43, 0.185, 0.028],
    [0, 0, 0],
    m.graphite,
    0.046,
    "battery-recess",
  );
  box(
    tail,
    [0.26, 0.05, 0.035],
    [0, 0.006, 0.024],
    m.orange,
    0.013,
    "battery-release-latch",
  );
  for (const side of [-1, 1])
    bolt(tail, [side * 0.17, -0.018, 0.019], [0, 0, 0], 0.014);

  const landing = group(root, "Landing-gear");
  for (const side of [-1, 1]) {
    const skid = group(landing, `Landing-skid-${side}`);
    beam(
      skid,
      "skid-rail",
      [side * 0.55, 0.078, -0.67],
      [side * 0.55, 0.078, 0.63],
      0.043,
      m.silver,
    );
    beam(
      skid,
      "upturned-skid-nose",
      [side * 0.55, 0.078, 0.63],
      [side * 0.55, 0.18, 0.84],
      0.043,
      m.silver,
    );
    beam(
      skid,
      "upturned-skid-tail",
      [side * 0.55, 0.078, -0.67],
      [side * 0.55, 0.14, -0.8],
      0.043,
      m.silver,
    );
    for (const z of [-0.48, 0.46]) {
      box(
        skid,
        [0.15, 0.08, 0.29],
        [side * 0.55, 0.04, z],
        m.rubber,
        0.027,
        "ground-contact-pad",
      );
      beam(
        skid,
        "landing-strut",
        [side * 0.34, 0.96, z * 0.76],
        [side * 0.55, 0.12, z],
        0.035,
        m.graphite,
      );
      sphere(
        skid,
        0.063,
        [side * 0.34, 0.96, z * 0.76],
        m.orange,
        "landing-strut-mount",
      );
      cylinder(
        skid,
        0.06,
        0.07,
        [side * 0.55, 0.137, z],
        m.ivory,
        null,
        "skid-strut-collar",
      );
    }
  }

  const camera = group(root, "Stabilised-camera", [0, 0.795, 0.385]);
  cylinder(
    camera,
    0.115,
    0.13,
    [0, 0.137, 0],
    m.graphite,
    null,
    "gimbal-yaw-bearing",
  );
  for (const side of [-1, 1]) {
    box(
      camera,
      [0.051, 0.26, 0.14],
      [side * 0.246, 0.01, 0],
      m.orange,
      0.025,
      "camera-gimbal-fork",
    );
    cylinder(
      camera,
      0.077,
      0.065,
      [side * 0.23, -0.04, 0],
      m.silver,
      [0, 0, Math.PI / 2],
      "camera-pitch-bearing",
    );
  }
  const eye = group(
    camera,
    "Survey-optics",
    [0, -0.023, 0.037],
    [0.055, -0.055, 0],
  );
  sphere(
    eye,
    0.221,
    [0, 0, 0],
    m.ivory,
    "spherical-camera-shell",
    [1, 0.92, 0.92],
  );
  lens(eye, "Main-survey-lens", [0, 0, 0.178], 0.168);
  sphere(eye, 0.02, [0.112, 0.117, 0.147], m.green, "recording-indicator");

  // One reusable swept blade geometry produces solid, exportable propellers.
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.035, -0.023);
  bladeShape.bezierCurveTo(0.15, -0.035, 0.29, -0.089, 0.37, -0.049);
  bladeShape.quadraticCurveTo(0.402, -0.023, 0.369, 0.009);
  bladeShape.bezierCurveTo(0.272, 0.046, 0.14, 0.019, 0.035, 0.023);
  bladeShape.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1,
    curveSegments: 8,
    steps: 1,
  });
  bladeGeometry.rotateX(-Math.PI / 2);
  for (const side of [-1, 1])
    for (const front of [-1, 1]) {
      const label = `${front > 0 ? "Front" : "Rear"}.${side < 0 ? "Left" : "Right"}`;
      const rotorPosition = [side * 0.98, 1.22, front * 0.815];
      const arm = group(root, `Rotor-arm.${label}`);
      const origin = [side * 0.32, 1.14, front * 0.32];
      beam(arm, "structural-arm", origin, rotorPosition, 0.074, m.graphite);
      beam(
        arm,
        "ivory-arm-fairing",
        [side * 0.36, 1.147, front * 0.351],
        [side * 0.85, 1.204, front * 0.707],
        0.103,
        m.ivory,
      );
      sphere(
        arm,
        0.107,
        [side * 0.86, 1.206, front * 0.715],
        m.orange,
        "motor-arm-coupler",
      );
      const motor = group(root, `Motor.${label}`, rotorPosition);
      cylinder(
        motor,
        0.127,
        0.19,
        [0, 0, 0],
        m.graphite,
        null,
        "brushless-motor",
      );
      cylinder(
        motor,
        0.13,
        0.037,
        [0, 0.085, 0],
        m.orange,
        null,
        "motor-top-collar",
      );
      cylinder(
        motor,
        0.096,
        0.022,
        [0, -0.1, 0],
        m.silver,
        null,
        "motor-base-plate",
      );
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        box(
          motor,
          [0.026, 0.097, 0.014],
          [Math.sin(angle) * 0.124, -0.006, Math.cos(angle) * 0.124],
          m.silver,
          0.003,
          `motor-cooling-fin-${i}`,
          [0, angle, 0],
        );
      }
      const guard = group(motor, `Propeller-guard.${label}`);
      ring(
        guard,
        0.457,
        0.025,
        [0, 0.142, 0],
        m.ivory,
        [Math.PI / 2, 0, 0],
        "upper-safety-ring",
      );
      ring(
        guard,
        0.457,
        0.016,
        [0, 0.011, 0],
        m.graphite,
        [Math.PI / 2, 0, 0],
        "lower-safety-ring",
      );
      for (let brace = 0; brace < 4; brace++) {
        const angle = (brace * Math.PI) / 2 + Math.PI / 4;
        const x = Math.sin(angle) * 0.457;
        const z = Math.cos(angle) * 0.457;
        beam(
          guard,
          "guard-spoke",
          [Math.sin(angle) * 0.1, -0.026, Math.cos(angle) * 0.1],
          [x, 0.011, z],
          0.013,
          m.graphite,
        );
        beam(
          guard,
          "vertical-guard-post",
          [x, 0.011, z],
          [x, 0.142, z],
          0.014,
          m.ivory,
        );
      }
      box(
        guard,
        [0.105, 0.047, 0.042],
        [0, 0.144, front * 0.456],
        m.orange,
        0.014,
        "guard-visibility-marker",
      );
      const rotor = group(motor, `Propeller.${label}`, [0, 0.119, 0]);
      rotor.userData.rotationDirection = side * front;
      propellers.push(rotor);
      for (const blade of [0, 1]) {
        mesh(
          rotor,
          bladeGeometry,
          m.graphite,
          [0, 0, 0],
          [0, blade * Math.PI, 0],
          `swept-blade-${blade + 1}`,
        );
        box(
          rotor,
          [0.037, 0.02, 0.035],
          [blade === 0 ? 0.355 : -0.355, 0.006, blade === 0 ? 0.025 : -0.025],
          m.orange,
          0.004,
          "propeller-tip-mark",
        );
      }
      cylinder(
        rotor,
        0.072,
        0.044,
        [0, 0.02, 0],
        m.ivory,
        null,
        "propeller-hub",
      );
      sphere(rotor, 0.035, [0, 0.045, 0], m.silver, "hub-cap", [1, 0.6, 1]);
    }

  const navigation = group(root, "Navigation-array", [0, 1.38, -0.29]);
  cylinder(
    navigation,
    0.108,
    0.04,
    [0, 0, 0],
    m.warm,
    null,
    "gps-receiver-base",
  );
  sphere(
    navigation,
    0.089,
    [0, 0.022, 0],
    m.ivory,
    "gps-ceramic-dome",
    [1, 0.43, 1],
  );
  const antenna = group(
    navigation,
    "Telemetry-antenna",
    [-0.19, -0.039, -0.062],
    [0.12, 0, 0.15],
  );
  cylinder(
    antenna,
    0.043,
    0.046,
    [0, 0, 0],
    m.graphite,
    null,
    "antenna-socket",
  );
  cylinder(
    antenna,
    0.014,
    0.305,
    [0, 0.175, 0],
    m.silver,
    null,
    "telemetry-whip",
  );
  sphere(antenna, 0.032, [0, 0.34, 0], m.orange, "telemetry-tip");

  ground(root);
  // Attitude belongs to the airframe's centre, not the ground contact origin.
  // Keep the outer root available for the viewer's separate actor transform.
  const airframeParts = [...root.children];
  const attitude = group(root, "Flight-attitude", [0, 1.14, 0]);
  for (const part of airframeParts) {
    part.position.sub(attitude.position);
    attitude.add(part);
  }
  const eyeQuaternion = eye.quaternion.clone();
  const cameraQuaternion = camera.quaternion.clone();
  const maxTilt = THREE.MathUtils.degToRad(8);
  let rotorAngle = 0;
  let rotorSpeed = 0;
  const settle = (value, target, dt) => {
    const next = THREE.MathUtils.damp(value, target, 7, dt);
    return Math.abs(next - target) < 0.00001 ? target : next;
  };

  return {
    root,
    update(dt, state) {
      if (state.mode === "inspect") {
        const angle = state.time * 19;
        const yaw = sampleLoop(state.time, INSPECT_DURATION, GIMBAL_YAW);
        const pitch = sampleLoop(state.time, INSPECT_DURATION, GIMBAL_PITCH);
        const previousEye = eye.quaternion.clone();
        const previousCamera = camera.quaternion.clone();
        let changed = rotorAngle !== angle || attitude.rotation.x !== 0
          || attitude.rotation.z !== 0;
        rotorAngle = angle;
        rotorSpeed = 0;
        propellers.forEach((rotor) => {
          rotor.rotation.y = rotorAngle * rotor.userData.rotationDirection;
        });
        attitude.rotation.set(0, 0, 0);
        camera.quaternion.copy(cameraQuaternion);
        camera.rotateY(yaw);
        eye.quaternion.copy(eyeQuaternion);
        eye.rotateX(pitch);
        changed ||= !previousEye.equals(eye.quaternion) || !previousCamera.equals(camera.quaternion);
        return changed;
      }

      const cameraChanged = !camera.quaternion.equals(cameraQuaternion);
      camera.quaternion.copy(cameraQuaternion);

      // Convert world velocity to the actor's heading so banking follows the
      // actual direction of travel even after the user changes the camera.
      const cosine = Math.cos(state.heading);
      const sine = Math.sin(state.heading);
      const localX = cosine * state.velocity.x - sine * state.velocity.z;
      const localZ = sine * state.velocity.x + cosine * state.velocity.z;
      const speed = Math.hypot(localX, localZ);
      const altitude = Math.max(0, state.position.y);
      const clearance = state.grounded ? 0 : THREE.MathUtils.smoothstep(altitude, 0, 0.55);
      const allowedTilt = maxTilt * clearance;
      const velocityScale = allowedTilt / Math.max(3, speed);
      let pitch = settle(attitude.rotation.x, localZ * velocityScale, dt);
      let roll = settle(attitude.rotation.z, -localX * velocityScale, dt);
      // Reduce residual bank immediately near touchdown: damping alone can
      // leave a descending skid below the floor for several frames.
      const tilt = Math.hypot(pitch, roll);
      if (tilt > allowedTilt) {
        const scale = allowedTilt / tilt;
        pitch *= scale;
        roll *= scale;
      }
      let changed = cameraChanged || attitude.rotation.x !== pitch || attitude.rotation.z !== roll;
      attitude.rotation.set(pitch, 0, roll);
      eye.quaternion.copy(attitude.quaternion).invert().multiply(eyeQuaternion);

      const targetRotorSpeed = state.grounded
        ? THREE.MathUtils.clamp(state.thrust, 0, 1) * 24
        : Math.min(60, 42 + Math.max(0, state.verticalSpeed) * 6 + speed * 2);
      const response = targetRotorSpeed > rotorSpeed ? 8 : 5;
      const decay = Math.exp(-response * dt);
      // Integrate the exponential spool curve analytically for stable motion
      // across refresh rates, including a short coast after landing.
      const rotation = targetRotorSpeed * dt
        + (rotorSpeed - targetRotorSpeed) * (1 - decay) / response;
      rotorSpeed = targetRotorSpeed + (rotorSpeed - targetRotorSpeed) * decay;
      if (targetRotorSpeed === 0 && rotorSpeed < 0.03) rotorSpeed = 0;
      if (rotation !== 0) {
        rotorAngle += rotation;
        propellers.forEach((rotor) => {
          rotor.rotation.y = rotorAngle * rotor.userData.rotationDirection;
        });
        changed = true;
      }
      return changed;
    },
    reset() {
      rotorAngle = 0;
      rotorSpeed = 0;
      attitude.rotation.set(0, 0, 0);
      camera.quaternion.copy(cameraQuaternion);
      eye.quaternion.copy(eyeQuaternion);
      propellers.forEach((rotor) => {
        rotor.rotation.y = 0;
      });
    },
  };
}
