import * as THREE from "three";

/** Runtime-only exhaust: attach to an effects group, never to the exported model. */
export function createExhaust(name, radius, maximumLength) {
  const root = new THREE.Group();
  root.name = name;
  root.visible = false;
  const geometry = new THREE.ConeGeometry(1, 1, 20, 1, true);
  // The open base begins at the nozzle; the tapered end points down local Y.
  geometry.rotateZ(Math.PI);
  geometry.translate(0, -0.5, 0);
  const outerMaterial = new THREE.MeshBasicMaterial({
    name: "Runtime azure exhaust glow",
    color: "#69cbea",
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    name: "Runtime pale exhaust core",
    color: "#e7f9ff",
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const outer = new THREE.Mesh(geometry, outerMaterial);
  outer.name = `${name}.Glow`;
  outer.scale.set(radius, 1, radius);
  const core = new THREE.Mesh(geometry, coreMaterial);
  core.name = `${name}.Core`;
  core.scale.set(radius * 0.53, 0.69, radius * 0.53);
  root.add(outer, core);

  return {
    root,
    setPower(power, time = 0, lengthLimit = maximumLength) {
      const level = THREE.MathUtils.clamp(power, 0, 1);
      root.visible = level > 0.015 && lengthLimit > 0;
      const pulse = 0.96 + Math.sin(time * 34) * 0.04;
      root.scale.set(
        0.68 + level * 0.32,
        Math.max(0, Math.min(maximumLength * (0.2 + level * 0.8) * pulse, lengthLimit)),
        0.68 + level * 0.32,
      );
    },
  };
}
