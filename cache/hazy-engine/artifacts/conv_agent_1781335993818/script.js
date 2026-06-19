import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- Configuration ---
const BOX_SIZE = 1;
const WORLD_SIZE = 32; 
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;

const blockTypes = {
    1: { color: 0x8B4513, name: 'Dirt', emoji: '🟫' },
    2: { color: 0x4B5320, name: 'Grass', emoji: '🟩' },
    3: { color: 0x808080, name: 'Stone', emoji: '🪨' },
    4: { color: 0xcd853f, name: 'Wood', emoji: '🪵' },
};

let selectedBlockType = 1;

// --- Setup Environment ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); 
scene.fog = new THREE.Fog(0x87CEEB, 10, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// Start player above the ground
camera.position.set(WORLD_SIZE/2, 10, WORLD_SIZE/2);

const renderer = new THREE.WebGLRenderer({ antialias: false }); // Pixelated feel
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
scene.add(sunLight);

// --- World Management ---
const cubes = [];

function createCube(x, y, z, type = 1) {
    const geometry = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
    const material = new THREE.MeshStandardMaterial({ 
        color: blockTypes[type].color,
        roughness: 0.8,
        metalness: 0.2
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(x, y, z);
    cube.userData = { type: type };
    cube.castShadow = true;
    cube.receiveShadow = true;
    scene.add(cube);
    cubes.push(cube);
    return cube;
}

function generateTerrain() {
    for (let x = 0; x < WORLD_SIZE; x++) {
        for (let z = 0; z < WORLD_SIZE; z++) {
            // Simple procedural height using sine waves
            const height = Math.floor(
                Math.sin(x * 0.2) * 2 + 
                Math.cos(z * 0.2) * 2 + 
                3
            );
            
            for (let y = 0; y <= height; y++) {
                let type = 3; // Stone
                if (y === height) type = 2; // Grass on top
                else if (y > height - 2) type = 1; // Dirt below grass
                
                createCube(x, y, z, type);
            }
        }
    }
}
generateTerrain();

// --- Input Handling ---
const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
    if (e.code === 'Space') keys.space = true;
    if (e.code === 'ShiftLeft') keys.shift = true;
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyD') keys.d = false;
    if (e.code === 'Space') keys.space = false;
    if (e.code === 'ShiftLeft') keys.shift = false;
});

// Block breaking & placing
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0);

window.addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cubes);

    if (intersects.length > 0) {
        const intersection = intersects[0];
        if (intersection.distance > 5) return; // Range limit

        if (e.button === 0) { // Left click: remove
            scene.remove(intersection.object);
            cubes.splice(cubes.indexOf(intersection.object), 1);
        } 
        else if (e.button === 2) { // Right click: add
            const pos = intersection.object.position.clone();
            pos.add(intersection.face.normal); 
            createCube(pos.x, pos.y, pos.z, selectedBlockType);
        }
    }
});

window.addEventListener('contextmenu', e => e.preventDefault());

// GUI Interaction
document.querySelectorAll('.slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.slot').forEach(s => s.classList.remove('active'));
        slot.classList.add('active');
        selectedBlockType = parseInt(slot.dataset.block);
    });
});

const blocker = document.getElementById('blocker');
blocker.addEventListener('pointerdown', () => controls.lock());
controls.addEventListener('lock', () => blocker.style.display = 'none');
controls.addEventListener('unlock', () => blocker.style.display = 'flex');

// --- Physics & Collision ---
const velocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
const gravity = 0.008;
const jumpForce = 0.12;
const friction = 0.9;

function checkCollision(nextPos) {
    // Simple AABB check: check if the player's bounding box intersects any block
    // We check a small area around the player
    const buffer = 0.2;
    for (let i = 0; i < cubes.length; i++) {
        const cube = cubes[i];
        const cp = cube.position;
        
        // Check if player is within the cube's bounds (with a small radius)
        if (nextPos.x + buffer > cp.x - 0.5 && nextPos.x - buffer < cp.x + 0.5 &&
            nextPos.z + buffer > cp.z - 0.5 && nextPos.z - buffer < cp.z + 0.5 &&
            nextPos.y + buffer > cp.y - 0.5 && nextPos.y - buffer < cp.y + 0.5) {
            return true;
        }
    }
    return false;
}

function animate() {
    requestAnimationFrame(animate);

    if (controls.isLocked) {
        const speed = keys.shift ? 0.15 : 0.08;
        
        // Get movement direction relative to camera
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(camera.up, forward).normalize();

        // Calculate desired movement
        const moveX = new THREE.Vector3();
        const moveZ = new THREE.Vector3();
        
        if (keys.w) moveX.add(forward);
        if (keys.s) moveX.sub(forward);
        if (keys.a) moveX.add(right);
        if (keys.d) moveX.sub(right);
        
        moveX.normalize().multiplyScalar(speed);

        // Horizontal Collision & Movement
        const nextPosX = camera.position.clone().add(new THREE.Vector3(moveX.x, 0, moveX.z));
        if (!checkCollision(nextPosX)) {
            camera.position.copy(nextPosX);
        } else {
            // Slide along walls: try X then Z
            const tryX = camera.position.clone().add(new THREE.Vector3(moveX.x, 0, 0));
            if (!checkCollision(tryX)) camera.position.copy(tryX);
            
            const tryZ = camera.position.clone().add(new THREE.Vector3(0, 0, moveX.z));
            if (!checkCollision(tryZ)) camera.position.copy(tryZ);
        }

        // Vertical Physics (Gravity & Jumping)
        velocity.y -= gravity;
        
        // Check if grounded (is there a block below us?)
        const groundCheckPos = camera.position.clone().add(new THREE.Vector3(0, -PLAYER_HEIGHT, 0));
        const isGrounded = checkCollision(groundCheckPos);

        if (isGrounded) {
            if (velocity.y < 0) velocity.y = 0;
            if (keys.space) velocity.y = jumpForce;
        }

        // Apply vertical movement and check for ceiling collision
        const nextPosY = camera.position.clone().add(new THREE.Vector3(0, velocity.y, 0));
        if (!checkCollision(nextPosY)) {
            camera.position.copy(nextPosY);
        } else {
            velocity.y = 0;
        }
        
        // Keep player above the absolute void
        if (camera.position.y < 2) camera.position.y = 2;
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
