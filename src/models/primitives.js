import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createMaterials } from "../materials.js";

/** Chamfered screw head with a real recessed slot, shared by both builders. */
export function createBoltHeadGeometry(radius) {
  const bevel = Math.min(0.0012, radius * 0.055);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius - bevel, 0, Math.PI * 2, false);
  const slot = new THREE.Path();
  const halfWidth = radius * 0.49;
  const halfHeight = radius * 0.085;
  slot.moveTo(-halfWidth, -halfHeight);
  slot.lineTo(-halfWidth, halfHeight);
  slot.lineTo(halfWidth, halfHeight);
  slot.lineTo(halfWidth, -halfHeight);
  slot.closePath();
  shape.holes.push(slot);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.009, bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 1, curveSegments: 8, steps: 1,
  });
  geometry.translate(0, 0, -0.0045);
  geometry.rotateZ(0.55);
  return geometry;
}

/** Small, asset-free construction kit shared by the expedition collection. */
export function createKit() {
  const materials = createMaterials();
  const geometries = new Map();
  const opticalCovers = new Map();
  let serial = 0;
  const cached = (key, create) => {
    if (!geometries.has(key)) geometries.set(key, create());
    return geometries.get(key);
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
    result.name = name || `detail-${++serial}`;
    result.position.set(...(position || [0, 0, 0]));
    if (rotation) result.rotation.set(...rotation);
    result.castShadow = !(material.transmission > 0);
    result.receiveShadow = !(material.transmission > 0);
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
      cached(`box:${size}:${radius}`, () =>
        radius > 0.006
          ? new RoundedBoxGeometry(
              ...size,
              radius > 0.06 && Math.min(...size) > 0.25 ? 3 : 2,
              Math.min(radius, Math.min(...size) / 2),
            )
          : new THREE.BoxGeometry(...size),
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
    material = materials.ivory,
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
  const sphere = (
    parent,
    radius,
    position,
    material = materials.ivory,
    name,
    scale,
  ) => {
    const result = mesh(
      parent,
      cached(
        `sphere:${radius}`,
        () => new THREE.SphereGeometry(radius, 24, 16),
      ),
      material,
      position,
      null,
      name,
    );
    if (scale) result.scale.set(...scale);
    return result;
  };
  const ring = (
    parent,
    radius,
    tube,
    position,
    material = materials.ivory,
    rotation,
    name,
  ) =>
    mesh(
      parent,
      cached(
        `ring:${radius}:${tube}`,
        () => new THREE.TorusGeometry(radius, tube, 8, 40),
      ),
      material,
      position,
      rotation,
      name,
    );
  const beam = (
    parent,
    name,
    start,
    end,
    radius,
    material = materials.silver,
  ) => {
    const from = new THREE.Vector3(...start);
    const to = new THREE.Vector3(...end);
    const direction = to.clone().sub(from);
    const result = cylinder(
      parent,
      radius,
      direction.length(),
      from.clone().add(to).multiplyScalar(0.5).toArray(),
      material,
      null,
      name,
    );
    result.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return result;
  };
  const bolt = (parent, position, rotation = [0, 0, 0], radius = 0.018) => {
    const holder = group(parent, `Fastener-${++serial}`, position, rotation);
    mesh(
      holder,
      cached(`bolt:${radius}`, () => createBoltHeadGeometry(radius)),
      materials.silver,
      [0, 0, 0],
      null,
      "bolt-head",
    );
    box(
      holder,
      [radius * 1.12, radius * 0.28, 0.001],
      [0, 0, 0.0005],
      materials.graphite,
      0,
      "bolt-slot",
      [0, 0, 0.55],
    );
    return holder;
  };
  const lens = (
    parent,
    name,
    position,
    radius = 0.16,
    rotation = [0, 0, 0],
  ) => {
    const eye = group(parent, name, position, rotation);
    const axis = [Math.PI / 2, 0, 0];
    cylinder(
      eye,
      radius * 1.17,
      radius * 0.5,
      [0, 0, 0],
      materials.darkMetal,
      axis,
      "optical-housing",
    );
    cylinder(
      eye,
      radius * 1.07,
      radius * 0.18,
      [0, 0, radius * 0.3],
      materials.silver,
      axis,
      "lens-mount",
    );
    cylinder(
      eye,
      radius,
      radius * 0.11,
      [0, 0, radius * 0.4],
      materials.blue,
      axis,
      "coated-lens",
    );
    ring(
      eye,
      radius * 0.99,
      radius * 0.035,
      [0, 0, radius * 0.49],
      materials.warm,
      null,
      "lens-rim",
    );
    ring(
      eye,
      radius * 0.77,
      radius * 0.028,
      [0, 0, radius * 0.474],
      materials.iris,
      null,
      "iris-ring",
    );
    sphere(
      eye,
      radius * 0.53,
      [0, 0, radius * 0.476],
      materials.pupil,
      "convex-optical-aperture",
      [1, 1, 0.055],
    );
    if (!opticalCovers.has(radius)) {
      const glass = materials.glass.clone();
      glass.thickness = Math.max(0.01, radius * 0.12);
      opticalCovers.set(radius, glass);
    }
    sphere(
      eye,
      radius * 0.965,
      [0, 0, radius * 0.515],
      opticalCovers.get(radius),
      "curved-glass-cover",
      [1, 1, 0.15],
    );
    sphere(
      eye,
      radius * 0.035,
      [-radius * 0.24, radius * 0.27, radius * 0.647],
      materials.white,
      "lens-reflection",
      [1, 0.55, 0.08],
    );
    return eye;
  };
  const ground = (root) => {
    root.updateMatrixWorld(true);
    root.position.y -= new THREE.Box3().setFromObject(root).min.y;
    root.updateMatrixWorld(true);
    return root;
  };
  return {
    materials,
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
  };
}
