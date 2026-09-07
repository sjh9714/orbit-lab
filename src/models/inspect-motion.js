/**
 * Sample a deterministic repeating actuator motion. Equal adjacent values
 * create true holds; quintic easing stops velocity and acceleration at each
 * waypoint. Tracks start and finish at the same value for a seamless loop.
 */
export function sampleLoop(time, duration, keys) {
  const seconds = Number.isFinite(time) ? time : 0;
  const phase = ((seconds % duration) + duration) % duration;
  for (let index = 1; index < keys.length; index++) {
    const [end, to] = keys[index];
    if (phase > end) continue;
    const [start, from] = keys[index - 1];
    if (from === to) return from;
    const t = Math.max(0, Math.min(1, (phase - start) / (end - start)));
    const eased = t * t * t * (t * (t * 6 - 15) + 10);
    return from + (to - from) * eased;
  }
  return keys[keys.length - 1][1];
}
