// Movement is independent of rendering, so time and limits remain deterministic.
export const FIXED_STEP = 1 / 60;
export const ARENA_RADIUS = 12;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function createStepper(step) {
  let accumulated = 0;
  return {
    advance(delta) {
      accumulated += clamp(delta, 0, 0.1);
      while (accumulated + 1e-10 >= FIXED_STEP) {
        step(FIXED_STEP);
        accumulated -= FIXED_STEP;
      }
    },
    reset() { accumulated = 0; },
  };
}

export function createMotion(id, radius = 1.5) {
  const state = {};
  let jumpTimer = 0;
  let jumpHeight = 1;
  let landingTimer = 0;
  const minimumAltitude = id === 'satellite' ? 1 : 0;
  function reset() {
    Object.assign(state, {
      mode: 'control', time: 0, position: { x: 0, y: id === 'satellite' ? 1.5 : 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0, signedSpeed: 0,
      turnRate: 0, distance: 0, grounded: id !== 'satellite', verticalSpeed: 0,
      phase: 'idle', crouch: 0, landing: 0, thrust: 0,
    });
    jumpTimer = landingTimer = 0;
    return state;
  }
  reset();
  function step(dt, input = {}, forward = { x: 0, z: -1 }) {
    const s = state, p = s.position, v = s.velocity;
    s.time += dt;
    const oldX = p.x, oldZ = p.z, oldHeading = s.heading;
    let f = input.forward || 0, r = input.right || 0;
    const length = Math.max(1, Math.hypot(f, r));
    f /= length; r /= length;
    const moving = Math.hypot(f, r) > 0.01;
    let dx = forward.x * f - forward.z * r;
    let dz = forward.z * f + forward.x * r;
    const airborne = id === 'drone' || id === 'satellite';
    landingTimer = Math.max(0, landingTimer - dt);
    s.landing = landingTimer / 0.18;
    s.crouch = 0;

    if (id === 'rover') {
      s.signedSpeed = approach(s.signedSpeed, input.primary ? 0 : f * 2, dt * (input.primary ? 14 : 4));
      const turn = input.primary ? 0 : -r * 1.6;
      s.heading += turn * dt;
      v.x = Math.sin(s.heading) * s.signedSpeed;
      v.z = Math.cos(s.heading) * s.signedSpeed;
    } else {
      const maxSpeed = { orbit: 2, drone: 3, lander: 1.4, satellite: 2.2 }[id];
      let targetSpeed = maxSpeed;
      if ((id === 'lander' || id === 'drone') && s.grounded) targetSpeed = 0;
      if (jumpTimer > 0 && id === 'orbit') targetSpeed *= 0.35;
      const acceleration = id === 'satellite' ? (moving ? 3.5 : 1.1) : id === 'orbit' ? 10 : 6;
      // A vector limit makes diagonal acceleration/deceleration isotropic.
      const ex = dx * targetSpeed - v.x, ez = dz * targetSpeed - v.z;
      const error = Math.hypot(ex, ez);
      const blend = error ? Math.min(1, acceleration * dt / error) : 0;
      v.x += ex * blend; v.z += ez * blend;
      if (Math.hypot(v.x, v.z) > 0.02) {
        const target = Math.atan2(v.x, v.z);
        s.heading += clamp(angleDelta(s.heading, target), -dt * 5, dt * 5);
      }
    }

    if (airborne) {
      const verticalInput = Number(Boolean(input.primary)) - Number(Boolean(input.secondary));
      const verticalLimit = id === 'drone' ? 2 : 1.2;
      v.y = approach(v.y, verticalInput * verticalLimit, dt * (id === 'drone' ? 5 : 2.4));
      p.y = clamp(p.y + v.y * dt, minimumAltitude, 6);
      if ((p.y === minimumAltitude && v.y < 0) || (p.y === 6 && v.y > 0)) v.y = 0;
      s.grounded = p.y <= 1e-6 && id === 'drone';
      s.thrust = s.grounded ? (input.primary ? 0.6 : 0) : clamp(0.45 + Math.abs(v.y) * 0.18 + Math.hypot(v.x,v.z) * 0.08, 0, 1);
    } else if (id !== 'rover') {
      if (s.grounded && jumpTimer <= 0 && landingTimer <= 0 &&
          (input.primaryPressed || (id === 'lander' && moving))) {
        jumpHeight = id === 'orbit' ? 1 : input.primaryPressed ? 1.2 : 0.35;
        jumpTimer = id === 'orbit' ? 0.12 : 0.08;
      }
      if (jumpTimer > 0) {
        const duration = id === 'orbit' ? 0.12 : 0.08;
        s.crouch = Math.sin(Math.PI / 2 * (1 - jumpTimer / duration));
        jumpTimer -= dt;
        if (jumpTimer <= 1e-8) {
          jumpTimer = 0;
          s.grounded = false;
          v.y = Math.sqrt(2 * 9.8 * jumpHeight);
          s.crouch = 0;
        }
      }
      if (!s.grounded) {
        p.y += v.y * dt - 0.5 * 9.8 * dt * dt;
        v.y -= 9.8 * dt;
        if (p.y <= 0) {
          p.y = 0; v.y = 0; s.grounded = true;
          landingTimer = 0.18; s.landing = 1;
        }
      }
      s.thrust = id === 'lander' && !s.grounded ? (v.y > 0 ? 1 : 0.35) : 0;
    }
    p.x += v.x * dt; p.z += v.z * dt;
    const limit = Math.max(1, ARENA_RADIUS - radius);
    const distanceFromOrigin = Math.hypot(p.x, p.z);
    if (distanceFromOrigin > limit) {
      p.x *= limit / distanceFromOrigin; p.z *= limit / distanceFromOrigin;
      // Remove outward velocity, preserving movement tangential to the boundary.
      const nx = p.x / limit, nz = p.z / limit;
      const outward = Math.max(0, v.x * nx + v.z * nz);
      v.x -= outward * nx; v.z -= outward * nz;
      if (id === 'rover') s.signedSpeed *= Math.min(1, Math.hypot(v.x,v.z) / (Math.abs(s.signedSpeed) || 1));
    }
    const traveled = Math.hypot(p.x - oldX, p.z - oldZ);
    s.distance += traveled;
    s.speed = traveled / dt;
    if (id !== 'rover') s.signedSpeed = s.speed;
    s.turnRate = angleDelta(oldHeading, s.heading) / dt;
    s.verticalSpeed = v.y;
    s.phase = jumpTimer > 0 ? 'crouch' : !s.grounded && Math.abs(v.y) > 0.01 ? (v.y > 0 ? 'rise' : 'fall') : landingTimer > 0 ? 'land' : s.speed > 0.01 ? 'move' : 'idle';
    return s;
  }
  return { state, step, reset };
}
