import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const photoDefaults = { preset: 'warm', composition: 'full', ratio: '16:9', longEdge: 2048, exposure: 1 };
export function photoDimensions(ratio, longEdge) {
  const [x, y] = ratio.split(':').map(Number);
  return x >= y ? [longEdge, Math.round(longEdge * y / x)] : [Math.round(longEdge * x / y), longEdge];
}

// Clones own transforms only. Geometry, materials and generated textures remain
// owned by the live model; removing a photograph must never dispose them.
export function createPhotoSession(source, actor, metadata, canvas, onChange, stage) {
  const root = source.clone(true);
  const subject = new THREE.Group();
  subject.name = 'photograph-subject';
  subject.add(root);
  subject.position.y = actor.position.y;
  subject.rotation.y = actor.rotation.y;
  subject.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(subject);
  const center = bounds.getCenter(new THREE.Vector3());
  subject.position.x -= center.x;
  subject.position.z -= center.z;
  subject.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(33, 16 / 9, .03, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .8;
  controls.minPolarAngle = .15;
  controls.maxPolarAngle = Math.PI / 2 - .02;
  controls.addEventListener('change', onChange);
  let composition = 'full';

  function compose(value = composition) {
    composition = value;
    subject.updateMatrixWorld(true);
    const part = value === 'detail' && root.getObjectByName(metadata?.focus);
    const box = new THREE.Box3().setFromObject(part || subject);
    if (value !== 'detail' && stage) box.union(new THREE.Box3().setFromObject(stage));
    const target = box.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(...(value === 'back' ? [-4.4, 2.3, -8.5] : value === 'detail' ? (metadata?.direction || [2, 1, 8]) : [4.4, 2.3, 8.5])).normalize();
    direction.applyAxisAngle(THREE.Object3D.DEFAULT_UP, subject.rotation.y);
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = .5;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).sub(target);
      distance = Math.max(distance, p.dot(direction) + Math.abs(p.dot(right)) / (tan * camera.aspect * .83), p.dot(direction) + Math.abs(p.dot(up)) / (tan * .83));
    }
    controls.minDistance = Math.max(.35, box.getBoundingSphere(new THREE.Sphere()).radius * 1.1);
    controls.maxDistance = Math.max(30, distance * 3);
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(direction, distance);
    controls.update();
    onChange();
  }
  function setAspect(aspect) {
    if (Math.abs(camera.aspect - aspect) < .0001) return;
    // Preserve an intentional orbit/zoom when only the viewport size changes.
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  compose();
  return { root, subject, camera, controls, compose, setAspect,
    dispose() { controls.removeEventListener('change', onChange); controls.dispose(); subject.removeFromParent(); }
  };
}

// Both preview and files use the very same linear HDR -> display transform.
// Export does not resize the visible canvas or rely on preserveDrawingBuffer.
export function createPhotoRenderer(renderer) {
  const output = new OutputPass();
  const preview = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  function draw(scene, camera, hdr, destination, exposure) {
    const oldTarget = renderer.getRenderTarget();
    const oldExposure = renderer.toneMappingExposure;
    const oldTransmissionScale = renderer.transmissionResolutionScale;
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    try {
      renderer.setScissorTest(false);
      renderer.toneMappingExposure = exposure * 1.1;
      // Photography uses full optical resolution in both preview and files.
      renderer.transmissionResolutionScale = 1;
      renderer.setRenderTarget(hdr);
      renderer.clear();
      renderer.render(scene, camera);
      output.renderToScreen = !destination;
      output.render(renderer, destination, hdr);
    } finally {
      renderer.toneMappingExposure = oldExposure;
      renderer.transmissionResolutionScale = oldTransmissionScale;
      renderer.setRenderTarget(oldTarget);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
    }
  }
  return {
    render(scene, camera, exposure) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      preview.setSize(size.x, size.y);
      draw(scene, camera, preview, null, exposure);
    },
    async capture(scene, camera, settings) {
      const [width, height] = photoDimensions(settings.ratio, settings.longEdge);
      if (Math.max(width, height) > renderer.capabilities.maxTextureSize) throw new Error('Requested image exceeds the GPU texture limit');
      const hdr = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 2 });
      const final = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, depthBuffer: false });
      const shotCamera = camera.clone();
      shotCamera.aspect = width / height;
      shotCamera.updateProjectionMatrix();
      try {
        draw(scene, shotCamera, hdr, final, settings.exposure);
        const pixels = new Uint8Array(width * height * 4);
        const result = await renderer.readRenderTargetPixelsAsync(final, 0, 0, width, height, pixels);
        if (!result || renderer.getContext().isContextLost()) throw new Error('Image readback failed');
        const image = new ImageData(width, height);
        const stride = width * 4;
        for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - y - 1) * stride, (height - y) * stride), y * stride);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image encoder unavailable');
        context.putImageData(image, 0, 0);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
        return { blob, width, height };
      } finally { hdr.dispose(); final.dispose(); }
    },
    dispose() { preview.dispose(); output.dispose(); }
  };
}
