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

// --- WORLD GENERATION ---
const boxGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const materials = {};
Object.values(BLOCKS).forEach(b => {
    materials[b.id] = new THREE.MeshStandardMaterial({ color: b.color });
});

const meshGroup = new THREE.Group();
scene.add(meshGroup);

function updateWorldMesh() {
    // Basic implementation: One mesh per block (Not optimized for large worlds)
    // For a real Minecraft clone, use InstancedMesh or custom Buffers
    meshGroup.clear();
    
    for (const key in voxels) {
        const [x, y, z] = key.split(',').map(Number);
        const blockId = voxels[key];
        
        const mesh = new THREE.Mesh(boxGeometry, materials[blockId]);
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        meshGroup.add(mesh);
    }
}

// Generate Terrain
for (let x = -CHUNK_SIZE; x < CHUNK_SIZE; x++) {
    for (let z = -CHUNK_SIZE; z < CHUNK_SIZE; z++) {
        const height = Math.floor(Math.sin(x / 8) * Math.cos(z / 8) * 3) + 10;
        for (let y = 0; y < height; y++) {
            let blockId = BLOCKS.STONE.id;
            if (y === height - 1) blockId = BLOCKS.GRASS.id;
            else if (y > height - 4) blockId = BLOCKS.DIRT.id;
            
            setVoxel(x, y, z, blockId);
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
    const intersects = raycaster.intersectObjects(meshGroup.children);

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
        
        // Break block on hit (Vandal is powerful!)
        const pos = intersect.object.position.clone().subScalar(0.5);
        setVoxel(pos.x, pos.y, pos.z, 0);
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
        const intersects = raycaster.intersectObjects(meshGroup.children);
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const pos = intersect.object.position.clone().subScalar(0.5);
            const normal = intersect.face.normal;
            const newPos = pos.add(normal);
            setVoxel(newPos.x, newPos.y, newPos.z, BLOCKS.GRASS.id);
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
