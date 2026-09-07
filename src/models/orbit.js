import * as THREE from "three";
import { createRobot } from "../robot.js";
import { sampleLoop } from "./inspect-motion.js";

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const STRIDE = 0.62;
const STANCE = 0.58;
const smoothstep = (value) => value * value * (3 - 2 * value);
const INSPECT_DURATION = 10;
const LOOK_YAW = [[0, 0], [0.7, -0.16], [1.4, -0.16], [2.15, 0.07], [4.4, 0.07], [5.15, 0], [10, 0]];
const LOOK_TILT = [[0, 0], [0.7, -0.035], [1.4, -0.035], [2.15, 0.025], [4.4, 0.025], [5.15, 0], [10, 0]];
const GREETING = [[0, 0], [1.4, 0], [1.9, 0.13], [2.35, -0.13], [2.8, 0.13], [3.25, -0.13], [3.7, 0], [10, 0]];

/** Rigid-joint animation. The viewer owns the actor's translation and heading. */
export function createOrbit() {
  const root = createRobot();
  const body = root.getObjectByName("BodyRig");
  const head = root.getObjectByName("Head");
  const antenna = root.getObjectByName("Antenna");
  const inverseRoot = new THREE.Matrix4();
  const inverseRootRotation = new THREE.Quaternion();
  const headingRotation = new THREE.Quaternion();
  const actorPosition = new THREE.Vector3();
  const travelDirection = new THREE.Vector3();
  const rootPoint = (object) => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseRoot);
  const rootRotation = (object) => inverseRootRotation.clone().multiply(object.getWorldQuaternion(new THREE.Quaternion()));
  const worldPoint = (local) => local.clone().applyQuaternion(headingRotation).add(actorPosition);
  const localPoint = (world) => world.clone().sub(actorPosition).applyQuaternion(headingRotation.clone().invert());

  root.updateWorldMatrix(true, true);
  inverseRoot.copy(root.matrixWorld).invert();
  inverseRootRotation.copy(root.getWorldQuaternion(new THREE.Quaternion())).invert();
  const legs = [-1, 1].map((side) => {
    const suffix = side < 0 ? "Left" : "Right";
    const hip = root.getObjectByName(`Hip.${suffix}`);
    const knee = root.getObjectByName(`Knee.${suffix}`);
    const ankle = root.getObjectByName(`Ankle.${suffix}`);
    const foot = root.getObjectByName(`Foot.${suffix}`);
    const sole = root.getObjectByName(`Sole.${suffix}`);
    return {
      side, hip, knee, ankle, foot, sole,
      upper: knee.position.clone(), lower: ankle.position.clone(),
      upperLength: knee.position.length(), lowerLength: ankle.position.length(),
      soleOffset: sole.position.clone(),
      rest: rootPoint(sole), restRotation: rootRotation(foot),
      goal: new THREE.Vector3(), anchor: new THREE.Vector3(), liftOff: new THREE.Vector3(),
      swing: false, swingStart: STANCE, plantedHeading: 0,
    };
  });
  const arms = [-1, 1].map((side) => {
    const suffix = side < 0 ? "Left" : "Right";
    const shoulder = root.getObjectByName(`Shoulder.${suffix}`);
    const elbow = root.getObjectByName(`Elbow.${suffix}`);
    const wrist = root.getObjectByName(`Wrist.${suffix}`);
    const hand = wrist.getObjectByName("Hand");
    // Walking lowers the exhibition's raised hand into a relaxed arm pose.
    const shoulderDown = new THREE.Quaternion().setFromUnitVectors(
      elbow.position.clone().normalize(), new THREE.Vector3(side * 0.16, -0.47, 0).normalize(),
    );
    const elbowDown = new THREE.Quaternion().setFromUnitVectors(
      wrist.position.clone().normalize(),
      new THREE.Vector3(side * 0.025, -0.35, 0.075).normalize().applyQuaternion(shoulderDown.clone().invert()),
    );
    const handDown = new THREE.Quaternion().setFromUnitVectors(
      hand.position.clone().normalize(), new THREE.Vector3(side * 0.01, -0.16, 0.02).normalize(),
    );
    const wristDown = shoulderDown.clone().multiply(elbowDown).invert().multiply(handDown);
    return { side, shoulder, elbow, wrist, shoulderDown, elbowDown, wristDown };
  });
  const animated = [body, head, antenna, ...legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]), ...arms.flatMap((arm) => [arm.shoulder, arm.elbow, arm.wrist])];
  const restPose = animated.map((node) => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone() }));
  const bodyRest = body.position.clone();
  let previousMode = null;
  let previousGrounded = true;
  let previousMoving = false;
  let distanceOrigin = 0;
  let turnDistance = 0;
  let locomotionBlend = 0;
  let airTuck = 0;
  let initialized = false;

  function restorePose() {
    for (const pose of restPose) {
      pose.node.position.copy(pose.position);
      pose.node.quaternion.copy(pose.quaternion);
    }
  }

  function seedFeet(heading) {
    for (const leg of legs) {
      leg.goal.copy(worldPoint(leg.rest));
      leg.anchor.copy(leg.goal);
      leg.liftOff.copy(leg.goal);
      leg.plantedHeading = heading;
      leg.swing = false;
    }
  }

  // Analytic two-bone IK with a forward knee pole. Joint lengths stay constant,
  // and ankle counter-rotation keeps the complete broad sole level with ground.
  function solveLeg(leg, soleTarget, footRotation) {
    const target = soleTarget.clone().sub(leg.soleOffset.clone().applyQuaternion(footRotation));
    const hipPoint = rootPoint(leg.hip);
    const direction = target.clone().sub(hipPoint);
    const reach = THREE.MathUtils.clamp(direction.length(), Math.abs(leg.upperLength - leg.lowerLength) + 0.00001, leg.upperLength + leg.lowerLength - 0.00001);
    direction.normalize();
    const pole = FORWARD.clone().addScaledVector(direction, -FORWARD.dot(direction));
    if (pole.lengthSq() < 0.00001) pole.set(1, 0, 0);
    pole.normalize();
    const along = (leg.upperLength ** 2 - leg.lowerLength ** 2 + reach ** 2) / (2 * reach);
    const bend = Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2));
    const kneePoint = hipPoint.clone().addScaledVector(direction, along).addScaledVector(pole, bend);
    const anklePoint = hipPoint.clone().addScaledVector(direction, reach);
    const hipParentInverse = rootRotation(leg.hip.parent).invert();
    leg.hip.quaternion.setFromUnitVectors(
      leg.upper.clone().normalize(), kneePoint.clone().sub(hipPoint).normalize().applyQuaternion(hipParentInverse),
    );
    leg.hip.updateWorldMatrix(true, true);
    leg.knee.quaternion.setFromUnitVectors(
      leg.lower.clone().normalize(), anklePoint.clone().sub(kneePoint).normalize().applyQuaternion(rootRotation(leg.hip).invert()),
    );
    leg.knee.updateWorldMatrix(true, true);
    leg.ankle.quaternion.copy(rootRotation(leg.knee).invert().multiply(footRotation));
    leg.ankle.updateWorldMatrix(true, true);
  }

  function wave(time, strength = 1) {
    head.rotateZ(Math.sin(time * 2.2) * 0.045 * strength);
    arms[1].wrist.rotateZ(Math.sin(time * 7) * 0.23 * strength);
  }

  return {
    root,
    update(dt, state) {
      const delta = THREE.MathUtils.clamp(dt, 0, 0.05);
      const time = state.time || 0;
      restorePose();
      if (state.mode === "inspect") {
        const yaw = sampleLoop(time, INSPECT_DURATION, LOOK_YAW);
        const tilt = sampleLoop(time, INSPECT_DURATION, LOOK_TILT);
        const greeting = sampleLoop(time, INSPECT_DURATION, GREETING);
        head.rotateY(yaw);
        head.rotateZ(tilt);
        arms[1].wrist.rotateZ(greeting);
        // A delayed copy gives the antenna a small follow-through without
        // history-dependent springs, so seeking and photographed poses agree.
        const delayedYaw = sampleLoop(time - 0.15, INSPECT_DURATION, LOOK_YAW);
        const delayedTilt = sampleLoop(time - 0.15, INSPECT_DURATION, LOOK_TILT);
        const delayedGreeting = sampleLoop(time - 0.12, INSPECT_DURATION, GREETING);
        antenna.rotateZ(THREE.MathUtils.clamp((delayedYaw - yaw) * 0.18 + (delayedGreeting - greeting) * 0.025, -0.018, 0.018));
        antenna.rotateX(THREE.MathUtils.clamp((delayedTilt - tilt) * 0.4, -0.01, 0.01));
        initialized = false;
        previousMode = "inspect";
        root.updateWorldMatrix(true, true);
        return true;
      }

      const heading = state.heading || 0;
      const speed = state.speed || 0;
      const distance = state.distance || 0;
      const grounded = state.grounded !== false && state.phase !== "rise" && state.phase !== "fall";
      const moving = grounded && state.phase !== "crouch" && state.phase !== "land" && (speed > 0.025 || Math.abs(state.turnRate || 0) > 0.08);
      actorPosition.set(state.position?.x || 0, state.position?.y || 0, state.position?.z || 0);
      headingRotation.setFromAxisAngle(UP, heading);
      travelDirection.set(state.velocity?.x || 0, 0, state.velocity?.z || 0);
      if (travelDirection.lengthSq() > 0.00001) travelDirection.normalize();
      else travelDirection.copy(FORWARD).applyQuaternion(headingRotation).multiplyScalar((state.signedSpeed || 0) < 0 ? -1 : 1);
      if (!initialized || previousMode !== "control" || (grounded && !previousGrounded)) {
        seedFeet(heading);
        distanceOrigin = distance;
        turnDistance = 0;
        initialized = true;
      }
      if (moving && !previousMoving) {
        distanceOrigin = distance;
        turnDistance = 0;
      }
      // Turning also moves the hip anchors around planted feet. Use short
      // alternating steps before that arc can exceed the short legs' reach.
      if (moving && speed < 0.05) turnDistance += Math.abs(state.turnRate || 0) * delta * 0.6;
      const cycle = Math.max(0, distance - distanceOrigin + turnDistance) / STRIDE;
      const airborne = !grounded;
      airTuck = THREE.MathUtils.damp(airTuck, airborne ? (state.phase === "rise" ? 0.07 : 0.015) : 0, 14, delta);
      const desiredBlend = moving || airborne || state.phase === "crouch" || state.phase === "land" ? 1 : 0;
      locomotionBlend = THREE.MathUtils.damp(locomotionBlend, desiredBlend, 12, delta);
      const crouch = THREE.MathUtils.clamp(state.crouch || 0, 0, 1);
      const landing = THREE.MathUtils.clamp(state.landing || 0, 0, 1);
      body.position.y = bodyRest.y - locomotionBlend * 0.065 - crouch * 0.10 - landing * 0.065;
      if (moving) {
        body.position.y += Math.cos(cycle * Math.PI * 4) * 0.008 * locomotionBlend;
        body.position.x += Math.sin(cycle * Math.PI * 2) * 0.018 * locomotionBlend;
        body.rotation.z += Math.sin(cycle * Math.PI * 2) * 0.014 * locomotionBlend;
      }
      body.rotation.x += (moving ? 0.035 : airborne ? -0.018 : crouch * 0.055) * locomotionBlend;

      for (const arm of arms) {
        const phase = cycle + (arm.side < 0 ? 0.25 : 0.75);
        const swing = moving ? Math.cos(phase * Math.PI * 2) * 0.31 * ((state.signedSpeed || 0) < 0 ? -1 : 1) : 0;
        const shoulderTarget = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swing);
        if (airborne) shoulderTarget.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), arm.side * 0.28));
        shoulderTarget.multiply(arm.shoulderDown);
        arm.shoulder.quaternion.slerp(shoulderTarget, locomotionBlend);
        arm.elbow.quaternion.slerp(arm.elbowDown, locomotionBlend);
        arm.wrist.quaternion.slerp(arm.wristDown, locomotionBlend);
      }
      wave(time, 1 - locomotionBlend);
      root.updateWorldMatrix(true, true);
      inverseRoot.copy(root.matrixWorld).invert();
      inverseRootRotation.copy(root.getWorldQuaternion(new THREE.Quaternion())).invert();

      for (const leg of legs) {
        let footRotation = leg.restRotation.clone();
        let soleTarget;
        if (airborne) {
          // The actor supplies the jump trajectory. Tuck the knees on ascent,
          // then extend the feet on descent in preparation for a level landing.
          soleTarget = leg.rest.clone().add(new THREE.Vector3(0, airTuck, -0.025));
          leg.goal.copy(worldPoint(soleTarget));
          leg.swing = false;
        } else {
          const phase = (cycle + (leg.side < 0 ? 0.25 : 0.75)) % 1;
          if (moving) {
            const swing = phase >= STANCE;
            const home = worldPoint(leg.rest);
            const lead = speed > 0.05 ? STRIDE * STANCE * 0.5 : 0;
            const touchdown = home.addScaledVector(travelDirection, lead);
            if (swing) {
              if (!leg.swing) {
                leg.liftOff.copy(leg.goal);
                leg.swingStart = phase;
              }
              const progress = THREE.MathUtils.clamp((phase - leg.swingStart) / (1 - leg.swingStart), 0, 1);
              leg.goal.copy(leg.liftOff).lerp(touchdown, smoothstep(progress));
              leg.goal.y = actorPosition.y + Math.sin(progress * Math.PI) * 0.105;
              leg.plantedHeading = heading;
            } else {
              if (leg.swing) {
                leg.anchor.copy(touchdown);
                leg.plantedHeading = heading;
              }
              leg.goal.copy(leg.anchor);
            }
            leg.swing = swing;
          } else {
            // Settle an interrupted step under the hips while the upper body
            // eases back to the original pose; never push the sole below floor.
            const home = worldPoint(leg.rest);
            leg.goal.lerp(home, 1 - Math.exp(-delta * 16));
            leg.goal.y = Math.max(actorPosition.y, leg.goal.y);
            leg.anchor.copy(leg.goal);
            leg.plantedHeading = heading;
            leg.swing = false;
          }
          soleTarget = localPoint(leg.goal);
          footRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, leg.plantedHeading - heading));
        }
        solveLeg(leg, soleTarget, footRotation);
      }
      previousMode = "control";
      previousGrounded = grounded;
      previousMoving = moving;
      root.updateWorldMatrix(true, true);
      return true;
    },
    reset() {
      restorePose();
      previousMode = null;
      previousGrounded = true;
      previousMoving = false;
      initialized = false;
      locomotionBlend = 0;
      airTuck = 0;
      distanceOrigin = 0;
      turnDistance = 0;
      root.updateWorldMatrix(true, true);
    },
  };
}
