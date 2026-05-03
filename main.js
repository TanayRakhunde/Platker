import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- CONFIGURATION ---
const CHUNK_SIZE = 16;
const WORLD_SIZE = 2; // Number of chunks in each direction
const BLOCK_SIZE = 1;

const BLOCKS = {
    GRASS: { id: 1, color: 0x4caf50 },
    DIRT: { id: 2, color: 0x8b4513 },
    STONE: { id: 3, color: 0x808080 },
    WOOD: { id: 4, color: 0x5d4037 },
    LEAVES: { id: 5, color: 0x2e7d32 }
};

// --- INITIALIZATION ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.05);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions');
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0); // Center of screen

instructions.addEventListener('click', () => {
    controls.lock();
});

controls.addEventListener('lock', () => {
    instructions.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    instructions.style.display = 'flex';
});

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// --- VOXEL WORLD DATA ---
const voxels = {}; // Key: "x,y,z", Value: blockId

function setVoxel(x, y, z, blockId) {
    const key = `${x},${y},${z}`;
    if (blockId === 0) {
        delete voxels[key];
    } else {
        voxels[key] = blockId;
    }
}

function getVoxel(x, y, z) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    return voxels[key] || 0;
}

// --- NOISE FUNCTION (Simple Perlin-like) ---
function lerp(a, b, t) { return a + (b - a) * t; }
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
const p = new Uint8Array(512);
const permutation = new Uint8Array(256);
for(let i=0; i<256; i++) permutation[i] = i;
for(let i=255; i>0; i--) { const j = Math.floor(Math.random() * (i + 1)); [permutation[i], permutation[j]] = [permutation[j], permutation[i]]; }
p.set(permutation); p.set(permutation, 256);

function noise(x, y, z) {
    const X = Math.floor(x) & 255; const Y = Math.floor(y) & 255; const Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x); const v = fade(y); const w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(w, lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
        lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
        lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
            lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
}

// --- WORLD GENERATION ---
const boxGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const materials = {};
Object.values(BLOCKS).forEach(b => {
    materials[b.id] = new THREE.MeshStandardMaterial({ color: b.color });
});

const instancedMeshes = {};
Object.values(BLOCKS).forEach(b => {
    const im = new THREE.InstancedMesh(boxGeometry, materials[b.id], 50000);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = 0;
    instancedMeshes[b.id] = im;
    scene.add(im);
});

function updateWorldMesh() {
    Object.values(instancedMeshes).forEach(im => im.count = 0);
    
    const matrix = new THREE.Matrix4();
    for (const key in voxels) {
        const [x, y, z] = key.split(',').map(Number);
        const blockId = voxels[key];
        const im = instancedMeshes[blockId];
        
        matrix.setPosition(x + 0.5, y + 0.5, z + 0.5);
        im.setMatrixAt(im.count, matrix);
        im.count++;
    }
    Object.values(instancedMeshes).forEach(im => im.instanceMatrix.needsUpdate = true);
}

function generateTree(x, y, z) {
    const trunkHeight = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < trunkHeight; i++) {
        setVoxel(x, y + i, z, BLOCKS.WOOD.id);
    }
    // Leaves
    for (let lx = -2; lx <= 2; lx++) {
        for (let lz = -2; lz <= 2; lz++) {
            for (let ly = 0; ly <= 2; ly++) {
                if (Math.abs(lx) + Math.abs(lz) + Math.abs(ly) < 4) {
                    setVoxel(x + lx, y + trunkHeight + ly, z + lz, BLOCKS.LEAVES.id);
                }
            }
        }
    }
}

// Generate Terrain
const WORLD_RADIUS = 32;
for (let x = -WORLD_RADIUS; x < WORLD_RADIUS; x++) {
    for (let z = -WORLD_RADIUS; z < WORLD_RADIUS; z++) {
        // Natural hills using noise
        const n = noise(x * 0.1, 0, z * 0.1);
        const height = Math.floor((n + 1) * 6) + 5;
        
        for (let y = 0; y < height; y++) {
            let blockId = BLOCKS.STONE.id;
            if (y === height - 1) blockId = BLOCKS.GRASS.id;
            else if (y > height - 4) blockId = BLOCKS.DIRT.id;
            setVoxel(x, y, z, blockId);
        }

        // Random trees
        if (x % 10 === 0 && z % 10 === 0 && Math.random() > 0.5) {
            generateTree(x, height, z);
        }
    }
}
updateWorldMesh();

// --- PLAYER PHYSICS & MOVEMENT ---
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const playerRadius = 0.4;
const playerHeight = 1.8;

camera.position.set(0, 15, 0);

const onKeyDown = (event) => {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward = true; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft = true; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward = true; break;
        case 'ArrowRight':
        case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) velocity.y += 0.2; canJump = false; break;
    }
};

const onKeyUp = (event) => {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward = false; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft = false; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward = false; break;
        case 'ArrowRight':
        case 'KeyD': moveRight = false; break;
    }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// --- WEAPON SYSTEM ---
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera); // Must add camera to scene to see its children

function createVandal() {
    // Voxel-style Vandal
    const bodyGeom = new THREE.BoxGeometry(0.1, 0.2, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.set(0.2, -0.2, -0.5);
    weaponGroup.add(body);

    const barrelGeom = new THREE.BoxGeometry(0.04, 0.04, 0.6);
    const barrel = new THREE.Mesh(barrelGeom, bodyMat);
    barrel.position.set(0.2, -0.15, -1.0);
    weaponGroup.add(barrel);

    const magGeom = new THREE.BoxGeometry(0.08, 0.3, 0.15);
    const mag = new THREE.Mesh(magGeom, bodyMat);
    mag.position.set(0.2, -0.35, -0.6);
    mag.rotation.x = -0.2;
    weaponGroup.add(mag);
}
createVandal();

// Shooting state
let isShooting = false;
let ammo = 25;
let maxAmmo = 25;
let reserveAmmo = 75;
let lastFireTime = 0;
const fireRate = 0.1; // 10 rounds per sec (approx Vandal)
const ammoCountEl = document.getElementById('ammo-count');

function shoot() {
    if (ammo <= 0) return;
    
    const now = performance.now() / 1000;
    if (now - lastFireTime < fireRate) return;
    
    lastFireTime = now;
    ammo--;
    ammoCountEl.innerText = ammo;

    // Recoil
    velocity.y += 0.05; // Kick up
    weaponGroup.position.z += 0.1; // Kick back

    // Raycast hit
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(instancedMeshes));

    // Muzzle Flash
    const flashGeom = new THREE.SphereGeometry(0.05);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const flash = new THREE.Mesh(flashGeom, flashMat);
    flash.position.set(0.2, -0.15, -1.3);
    weaponGroup.add(flash);
    setTimeout(() => weaponGroup.remove(flash), 50);

    // Tracer
    const tracerPoints = [
        new THREE.Vector3(0.2, -0.15, -1.3),
        new THREE.Vector3(0, 0, -50)
    ];
    
    if (intersects.length > 0) {
        const intersect = intersects[0];
        tracerPoints[1] = weaponGroup.worldToLocal(intersect.point.clone());
        
        // Break block on hit using instanceId
        const instanceId = intersect.instanceId;
        const targetMesh = intersect.object;
        const matrix = new THREE.Matrix4();
        targetMesh.getMatrixAt(instanceId, matrix);
        const pos = new THREE.Vector3().setFromMatrixPosition(matrix).subScalar(0.5);
        
        setVoxel(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), 0);
        updateWorldMesh();
    }

    const tracerGeom = new THREE.BufferGeometry().setFromPoints(tracerPoints);
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 });
    const tracer = new THREE.Line(tracerGeom, tracerMat);
    weaponGroup.add(tracer);
    
    // Fade out tracer
    let opacity = 0.8;
    const fade = setInterval(() => {
        opacity -= 0.1;
        tracerMat.opacity = opacity;
        if (opacity <= 0) {
            weaponGroup.remove(tracer);
            clearInterval(fade);
        }
    }, 20);
}

// --- INTERACTION (PLACE/BREAK/SHOOT) ---
window.addEventListener('mousedown', (event) => {
    if (!controls.isLocked) return;

    if (event.button === 0) { // Left Click: Shoot/Break
        isShooting = true;
    } else if (event.button === 2) { // Right Click: Place
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(Object.values(instancedMeshes));
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const instanceId = intersect.instanceId;
            const targetMesh = intersect.object;
            const matrix = new THREE.Matrix4();
            targetMesh.getMatrixAt(instanceId, matrix);
            const pos = new THREE.Vector3().setFromMatrixPosition(matrix).subScalar(0.5);
            
            const normal = intersect.face.normal;
            const newPos = pos.add(normal);
            setVoxel(Math.floor(newPos.x), Math.floor(newPos.y), Math.floor(newPos.z), BLOCKS.GRASS.id);
            updateWorldMesh();
        }
    }
});

window.addEventListener('mouseup', (event) => {
    if (event.button === 0) isShooting = false;
});

// --- GAME LOOP ---
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    if (controls.isLocked) {
        const time = performance.now();
        const delta = (time - prevTime) / 1000;

        // Shooting
        if (isShooting) shoot();

        // Weapon Sway & Recoil Recovery
        weaponGroup.position.x += (0 - weaponGroup.position.x) * 5 * delta;
        weaponGroup.position.y += (0 - weaponGroup.position.y) * 5 * delta;
        weaponGroup.position.z += (0 - weaponGroup.position.z) * 10 * delta;

        // Movement sway
        if (moveForward || moveBackward || moveLeft || moveRight) {
            weaponGroup.position.y += Math.sin(time * 0.01) * 0.002;
            weaponGroup.position.x += Math.cos(time * 0.005) * 0.001;
        }

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 0.05 * delta; // Gravity

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        // Collision Detection (Simple)
        const nextPos = camera.position.clone();
        nextPos.x += velocity.x * delta;
        nextPos.z += velocity.z * delta;
        
        if (getVoxel(nextPos.x, nextPos.y - playerHeight, nextPos.z) !== 0) {
            velocity.y = 0;
            canJump = true;
        } else {
            camera.position.y += velocity.y;
        }

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Ground constraint
        if (camera.position.y < 2) {
            velocity.y = 0;
            camera.position.y = 2;
            canJump = true;
        }

        prevTime = time;
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
