import { test, expect } from "@playwright/test";
import {
  ARENA_RADIUS,
  FIXED_STEP,
  createMotion,
  createStepper,
} from "../src/motion.js";

const ids = ["orbit", "rover", "drone", "lander", "satellite"];
const copy = (state) => structuredClone(state);
const horizontalDistance = (position) => Math.hypot(position.x, position.z);

function advance(motion, seconds, input = {}, forward) {
  const trace = [];
  for (let tick = 0; tick < Math.round(seconds / FIXED_STEP); tick++) {
    motion.step(
      FIXED_STEP,
      typeof input === "function" ? input(tick) : input,
      forward,
    );
    trace.push(copy(motion.state));
  }
  return trace;
}

function departures(trace, initiallyGrounded = true) {
  let wasGrounded = initiallyGrounded;
  let count = 0;
  for (const state of trace) {
    if (wasGrounded && !state.grounded) count++;
    wasGrounded = state.grounded;
  }
  return count;
}

test("robot walking follows the camera, normalises diagonals and settles after release", () => {
  const straight = createMotion("orbit");
  const diagonal = createMotion("orbit");
  advance(straight, 1, { forward: 1 });
  advance(diagonal, 1, { forward: 1, right: 1 });
  expect(straight.state.position.z).toBeLessThan(-1.5);
  expect(straight.state.speed).toBeCloseTo(2, 8);
  expect(diagonal.state.speed).toBeCloseTo(straight.state.speed, 8);
  expect(diagonal.state.distance).toBeCloseTo(straight.state.distance, 8);
  expect(diagonal.state.position.x).toBeGreaterThan(0);
  expect(diagonal.state.position.z).toBeLessThan(0);

  const turnedCamera = createMotion("orbit");
  advance(turnedCamera, 1, { forward: 1 }, { x: 1, z: 0 });
  expect(turnedCamera.state.position.x).toBeCloseTo(-straight.state.position.z, 8);
  expect(turnedCamera.state.position.z).toBe(0);

  advance(straight, 0.3);
  const stopped = copy(straight.state.position);
  advance(straight, 1);
  expect(straight.state.position).toEqual(stopped);
  expect(straight.state.speed).toBe(0);
  expect(straight.state.phase).toBe("idle");
});

test("robot jumps one metre, ignores airborne presses and does not auto-repeat a held jump", () => {
  const motion = createMotion("orbit");
  const trace = advance(motion, 2.5, (tick) => ({
    primary: true,
    primaryPressed: tick === 0 || tick === 20 || tick === 35,
  }));
  expect(departures(trace)).toBe(1);
  expect(Math.max(...trace.map((state) => state.position.y))).toBeCloseTo(1, 2);
  expect(Math.min(...trace.map((state) => state.position.y))).toBe(0);
  const phases = new Set(trace.map((state) => state.phase));
  for (const phase of ["crouch", "rise", "fall", "land", "idle"])
    expect(phases.has(phase), phase).toBe(true);
  expect(motion.state.grounded).toBe(true);
  expect(motion.state.velocity.y).toBe(0);

  const secondJump = advance(motion, 1.5, (tick) => ({
    primary: tick === 0,
    primaryPressed: tick === 0,
  }));
  expect(departures(secondJump)).toBe(1);
  expect(Math.max(...secondJump.map((state) => state.position.y))).toBeCloseTo(1, 2);
});

test("rover drives in its heading, reverses and turns both ways in place", () => {
  const motion = createMotion("rover");
  advance(motion, 1, { forward: 1 }, { x: 1, z: 0 });
  expect(motion.state.position.x).toBe(0);
  expect(motion.state.position.z).toBeGreaterThan(1);
  expect(motion.state.signedSpeed).toBeCloseTo(2, 8);
  advance(motion, 1.5, { forward: -1 });
  expect(motion.state.signedSpeed).toBeCloseTo(-2, 8);
  const beforeReverse = motion.state.position.z;
  advance(motion, 0.25, { forward: -1 });
  expect(motion.state.position.z).toBeLessThan(beforeReverse);

  const left = createMotion("rover");
  const right = createMotion("rover");
  advance(left, 0.5, { right: -1 });
  advance(right, 0.5, { right: 1 });
  expect(left.state.heading).toBeCloseTo(-right.state.heading, 8);
  expect(Math.abs(right.state.turnRate)).toBeCloseTo(1.6, 8);
  expect(horizontalDistance(left.state.position)).toBe(0);
  expect(horizontalDistance(right.state.position)).toBe(0);
});

test("rover brake overrides throttle and steering and holds a stopped position", () => {
  const motion = createMotion("rover");
  advance(motion, 1, { forward: 1 });
  const before = copy(motion.state);
  advance(motion, 0.3, { forward: 1, right: 1, primary: true });
  expect(motion.state.signedSpeed).toBe(0);
  expect(motion.state.speed).toBe(0);
  expect(motion.state.heading).toBe(before.heading);
  expect(motion.state.distance - before.distance).toBeLessThan(0.2);
  const stopped = copy(motion.state.position);
  advance(motion, 1, { forward: 1, right: 1, primary: true });
  expect(motion.state.position).toEqual(stopped);
  expect(motion.state.turnRate).toBe(0);
});

test("a grounded drone stays on its skids until takeoff", () => {
  const motion = createMotion("drone");
  advance(motion, 2, { forward: 1, right: 1 });
  expect(motion.state.position).toEqual({ x: 0, y: 0, z: 0 });
  expect(motion.state.speed).toBe(0);
  expect(motion.state.distance).toBe(0);
  expect(motion.state.grounded).toBe(true);

  advance(motion, 1, { forward: 1, primary: true });
  expect(motion.state.position.y).toBeGreaterThan(1);
  expect(motion.state.position.z).toBeLessThan(-1);
  expect(motion.state.grounded).toBe(false);
});

test("drone ascends, holds altitude after braking, and descends on command", () => {
  const motion = createMotion("drone");
  advance(motion, 1.5, { primary: true });
  expect(motion.state.verticalSpeed).toBeCloseTo(2, 8);
  expect(motion.state.position.y).toBeGreaterThan(2);
  advance(motion, 0.6);
  const heldAltitude = motion.state.position.y;
  expect(motion.state.verticalSpeed).toBe(0);
  advance(motion, 1);
  expect(motion.state.position.y).toBe(heldAltitude);
  expect(motion.state.grounded).toBe(false);

  advance(motion, 0.5, { primary: true, secondary: true });
  expect(motion.state.position.y).toBe(heldAltitude);
  advance(motion, 1, { secondary: true });
  expect(motion.state.position.y).toBeLessThan(heldAltitude - 1);
  expect(motion.state.verticalSpeed).toBeCloseTo(-2, 8);
});

test("drone horizontal diagonals do not exceed its speed while climbing", () => {
  const motion = createMotion("drone");
  const trace = advance(motion, 2, { forward: 1, right: 1, primary: true });
  expect(Math.max(...trace.map((state) => state.speed))).toBeLessThanOrEqual(3 + 1e-8);
  expect(motion.state.speed).toBeCloseTo(3, 8);
  expect(motion.state.verticalSpeed).toBeCloseTo(2, 8);
  expect(motion.state.position.x).toBeCloseTo(-motion.state.position.z, 8);
});

for (const [id, floor] of [["drone", 0], ["satellite", 1]]) {
  test(`${id} respects its altitude floor and six-metre ceiling`, () => {
    const motion = createMotion(id);
    const ascent = advance(motion, 10, { primary: true });
    expect(ascent.every((state) => state.position.y <= 6)).toBe(true);
    expect(motion.state.position.y).toBe(6);
    expect(motion.state.verticalSpeed).toBe(0);
    const descent = advance(motion, 10, { secondary: true });
    expect(descent.every((state) => state.position.y >= floor)).toBe(true);
    expect(motion.state.position.y).toBe(floor);
    expect(motion.state.verticalSpeed).toBe(0);
    expect(motion.state.grounded).toBe(id === "drone");
  });
}

test("lander directional movement repeats low hops with distinct landings", () => {
  const motion = createMotion("lander");
  const trace = advance(motion, 4, { forward: 1 });
  expect(departures(trace)).toBeGreaterThanOrEqual(4);
  expect(Math.max(...trace.map((state) => state.position.y))).toBeCloseTo(0.35, 2);
  expect(trace.every((state) => state.position.y >= 0)).toBe(true);
  expect(trace.filter((state) => state.phase === "land").length).toBeGreaterThan(3);
  expect(motion.state.position.z).toBeLessThan(-2);
  expect(Math.max(...trace.map((state) => state.speed))).toBeLessThanOrEqual(1.4 + 1e-8);
});

test("lander primary action makes one higher hop without repeating a held press", () => {
  const motion = createMotion("lander");
  const trace = advance(motion, 3, (tick) => ({
    primary: true,
    primaryPressed: tick === 0 || tick === 20,
  }));
  expect(departures(trace)).toBe(1);
  expect(Math.max(...trace.map((state) => state.position.y))).toBeCloseTo(1.2, 2);
  expect(trace.some((state) => state.thrust > 0 && state.phase === "rise")).toBe(true);
  expect(motion.state.grounded).toBe(true);
  expect(motion.state.position.y).toBe(0);
  expect(motion.state.phase).toBe("idle");
});

test("satellite coasts and decelerates to rest in two seconds after release", () => {
  const motion = createMotion("satellite");
  advance(motion, 1, { forward: 1, right: 1 });
  expect(motion.state.speed).toBeCloseTo(2.2, 8);
  const distanceAtRelease = motion.state.distance;
  advance(motion, 1);
  expect(motion.state.speed).toBeCloseTo(1.1, 8);
  expect(motion.state.distance).toBeGreaterThan(distanceAtRelease + 1.5);
  advance(motion, 1);
  expect(motion.state.speed).toBeCloseTo(0, 8);
  const stopped = copy(motion.state.position);
  advance(motion, 1);
  expect(motion.state.position.x).toBeCloseTo(stopped.x, 8);
  expect(motion.state.position.z).toBeCloseTo(stopped.z, 8);
  expect(motion.state.position.y).toBe(1.5);
});

for (const id of ids) {
  test(`${id} leaves room for its model radius at the arena boundary`, () => {
    const radius = id === "satellite" ? 3.4 : 2.2;
    const limit = ARENA_RADIUS - radius;
    const motion = createMotion(id, radius);
    const trace = advance(motion, 30, (tick) => ({
      forward: 1,
      primary: id === "drone" && tick < 60,
    }));
    expect(Math.max(...trace.map((state) => horizontalDistance(state.position))))
      .toBeLessThanOrEqual(limit + 1e-8);
    expect(horizontalDistance(motion.state.position)).toBeCloseTo(limit, 7);
    const { position, velocity } = motion.state;
    const outward = (position.x * velocity.x + position.z * velocity.z) / limit;
    expect(outward).toBeLessThanOrEqual(1e-8);
  });
}

test("arena collision preserves useful motion along the boundary", () => {
  const motion = createMotion("orbit", 2);
  advance(motion, 8, { forward: 1 });
  const trace = advance(motion, 1, { forward: 1, right: 1 });
  expect(motion.state.position.x).toBeGreaterThan(0.8);
  expect(trace.every((state) => horizontalDistance(state.position) <= ARENA_RADIUS - 2 + 1e-8)).toBe(true);
});

function sampleAtFrameRate(id, fps) {
  const motion = createMotion(id);
  const trace = [];
  let tick = 0;
  const stepper = createStepper((dt) => {
    motion.step(dt, {
      forward: 1,
      primary: id === "drone" && tick < 45,
      primaryPressed: id === "orbit" && tick === 0,
    });
    trace.push(copy(motion.state));
    tick++;
  });
  for (let frame = 0; frame < fps * 2; frame++) stepper.advance(1 / fps);
  return {
    state: copy(motion.state),
    ticks: tick,
    peak: Math.max(...trace.map((state) => state.position.y)),
    departures: departures(trace, id !== "satellite"),
  };
}

for (const id of ids) {
  test(`${id} travels and jumps identically at 30, 60 and 120 fps`, () => {
    const baseline = sampleAtFrameRate(id, 60);
    expect(baseline.ticks).toBe(120);
    for (const fps of [30, 120]) {
      const result = sampleAtFrameRate(id, fps);
      expect(result.ticks).toBe(120);
      expect(result.state.position).toEqual(baseline.state.position);
      expect(result.state.distance).toBe(baseline.state.distance);
      expect(result.peak).toBe(baseline.peak);
      expect(result.departures).toBe(baseline.departures);
    }
    if (id === "orbit") expect(baseline.peak).toBeCloseTo(1, 2);
    if (id === "lander") expect(baseline.peak).toBeCloseTo(0.35, 2);
  });
}

test("reset clears velocities, held jump timers and landing state for every model", () => {
  for (const id of ids) {
    const motion = createMotion(id);
    const initial = copy(motion.state);
    advance(motion, 0.05, { forward: 1, primary: true, primaryPressed: true });
    expect(motion.state).not.toEqual(initial);
    motion.reset();
    expect(motion.state).toEqual(initial);
    const fresh = createMotion(id);
    expect(advance(motion, 1, { forward: 1 })).toEqual(advance(fresh, 1, { forward: 1 }));
  }
});

test("fixed stepper clears partial frames and bounds elapsed time after interruption", () => {
  const deltas = [];
  const stepper = createStepper((dt) => deltas.push(dt));
  stepper.advance(FIXED_STEP * 0.75);
  expect(deltas).toHaveLength(0);
  stepper.reset();
  stepper.advance(FIXED_STEP * 0.5);
  expect(deltas).toHaveLength(0);
  stepper.advance(FIXED_STEP * 0.5);
  expect(deltas).toEqual([FIXED_STEP]);
  stepper.advance(2);
  expect(deltas).toHaveLength(7);
  expect(deltas.every((dt) => dt === FIXED_STEP)).toBe(true);
  stepper.advance(-1);
  expect(deltas).toHaveLength(7);
});
