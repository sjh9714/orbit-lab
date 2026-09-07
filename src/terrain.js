import * as THREE from 'three';

export function createTerrain() {
  const root = new THREE.Group();
  root.name = 'exploration-ground';
  const sand = new THREE.MeshStandardMaterial({ color: '#cbbba1', roughness: 1 });
  const pad = new THREE.MeshStandardMaterial({ color: '#adab98', roughness: 0.9, metalness: 0.12 });
  const paint = new THREE.MeshStandardMaterial({ color: '#e8dcc3', roughness: 1 });
  const coral = new THREE.MeshStandardMaterial({ color: '#b76b44', roughness: 0.9 });
  const rock = new THREE.MeshStandardMaterial({ color: '#a3947e', roughness: 1, flatShading: true });
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x,y,z); mesh.receiveShadow = true;
    root.add(mesh); return mesh;
  };
  const plane = add(new THREE.PlaneGeometry(200,200), sand, 0,-0.023,0);
  plane.rotation.x = -Math.PI/2;
  const disc = add(new THREE.CircleGeometry(3.5,80), pad, 0,-0.015,0);
  disc.rotation.x = -Math.PI/2;
  for (const radius of [3.2, 6, 9, 12]) {
    const ring = add(new THREE.RingGeometry(radius-0.025, radius+0.025,120), radius===12 ? coral : paint, 0,-0.008,0);
    ring.rotation.x = -Math.PI/2;
  }
  for (let i=0; i<48; i++) {
    const angle = i*Math.PI/24;
    const mark = add(new THREE.BoxGeometry(i%4===0 ? .06 : .035,.012,i%4===0 ? .38 : .16),paint,Math.sin(angle)*11.65,0,Math.cos(angle)*11.65);
    mark.rotation.y = angle;
  }
  for (const x of [-.9,.9]) add(new THREE.BoxGeometry(.12,.014,1.8),paint,x,0,0);
  add(new THREE.BoxGeometry(1.9,.014,.12),paint,0,0,0);
  // Seeded shapes keep the scene reproducible and the center clear for motion.
  for(let i=0;i<30;i++) {
    const angle = i*2.399963;
    const radius = 15 + (i%6)*2.1;
    const mesh = add(new THREE.DodecahedronGeometry(.3+(i%5)*.18,0),rock, Math.cos(angle)*radius,.12,Math.sin(angle)*radius);
    mesh.scale.set(1+(i%3)*.35,.6+(i%2)*.2,1.1);
    mesh.rotation.set(i*.24,i*1.8,i*.1);
    mesh.castShadow = true;
  }
  for(let i=0;i<8;i++) {
    const angle = i*Math.PI/4;
    const x=Math.sin(angle)*12.8,z=Math.cos(angle)*12.8;
    add(new THREE.CylinderGeometry(.1,.16,.4,12),pad,x,.2,z).castShadow=true;
    add(new THREE.CylinderGeometry(.105,.105,.1,12),coral,x,.37,z);
  }
  return root;
}
