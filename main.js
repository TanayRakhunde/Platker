import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const cursor = document.getElementById('hand-cursor');
const statusText = document.getElementById('tracking-status');
const actionEl = document.getElementById('current-action');
const gameContainer = document.getElementById('game-container');
const startBtn = document.getElementById('start-btn');
const startOverlay = document.getElementById('start-overlay');

// --- CURSOR SMOOTHING ---
let cursorX = 0;
let cursorY = 0;
let targetX = 0;
let targetY = 0;
const lerpFactor = 0.25;

// --- CURSOR PARTICLES ---
const particleCount = 20;
const particles = [];
function initParticles() {
    for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'cursor-particle';
        cursor.appendChild(p);
        particles.push({
            el: p,
            ox: 0, // Offset X
            oy: 0  // Offset Y
        });
    }
}
initParticles();

// --- INTERACTION LOGIC ---
const PINCH_THRESHOLD = 0.05;
const FIST_THRESHOLD = 0.15;
let wasPinching = false;
let isFist = false;

function detectFist(landmarks) {
    // Wrist is 0, Palm center is 9
    const palm = landmarks[0];
    const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
    
    let totalDist = 0;
    tips.forEach(tip => {
        const dx = tip.x - palm.x;
        const dy = tip.y - palm.y;
        totalDist += Math.sqrt(dx*dx + dy*dy);
    });
    
    return (totalDist / 4) < FIST_THRESHOLD;
}

function handleExplosion(fistActive) {
    if (fistActive === isFist) return;
    isFist = fistActive;
    
    if (isFist) {
        cursor.classList.add('exploded');
        particles.forEach(p => {
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 150;
            p.ox = Math.cos(angle) * dist;
            p.oy = Math.sin(angle) * dist;
            p.el.style.transform = `translate(${p.ox}px, ${p.oy}px) scale(${Math.random()})`;
        });
    } else {
        cursor.classList.remove('exploded');
        particles.forEach(p => {
            p.ox = 0;
            p.oy = 0;
            p.el.style.transform = `translate(0, 0) scale(1)`;
        });
    }
}

function checkInteractions(isPinching) {
    if (isFist) return; // Can't click with a fist

    const icons = document.querySelectorAll('.icon-box');
    icons.forEach(icon => {
        const rect = icon.getBoundingClientRect();
        const isHovered = (
            cursorX >= rect.left &&
            cursorX <= rect.right &&
            cursorY >= rect.top &&
            cursorY <= rect.bottom
        );

        if (isHovered) {
            icon.classList.add('hovered');
            if (isPinching && !wasPinching) {
                icon.classList.add('clicked');
                setTimeout(() => icon.classList.remove('clicked'), 200);
            }
        } else {
            icon.classList.remove('hovered');
        }
    });
    wasPinching = isPinching;
}

// --- MEDIAPIPE LOGIC ---
function onResults(results) {
    const rect = canvasElement.parentElement.getBoundingClientRect();
    canvasElement.width = rect.width;
    canvasElement.height = rect.height;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
    canvasCtx.scale(-1, 1);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusText.innerText = 'TRACKING';
        
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, {color: '#00f2ff', lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, {color: '#fff', lineWidth: 1, radius: 2});
            
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];
            
            targetX = (1 - indexTip.x) * window.innerWidth;
            targetY = indexTip.y * window.innerHeight;
            
            // Fist Detection
            const fistActive = detectFist(landmarks);
            handleExplosion(fistActive);

            if (!isFist) {
                // Pinch Detection
                const dx = indexTip.x - thumbTip.x;
                const dy = indexTip.y - thumbTip.y;
                const dz = indexTip.z - thumbTip.z;
                const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                
                const isPinching = distance < PINCH_THRESHOLD;
                actionEl.innerText = isPinching ? 'CLICK' : 'HOVER';
                
                if (isPinching) {
                    cursor.style.transform = 'translate(-50%, -50%) scale(0.7)';
                } else {
                    cursor.style.transform = 'translate(-50%, -50%) scale(1)';
                }
                
                checkInteractions(isPinching);
            } else {
                actionEl.innerText = 'FIST (EXPLODED)';
            }
        }
    } else {
        statusText.innerText = 'OFFLINE';
        actionEl.innerText = 'IDLE';
    }
    canvasCtx.restore();
}

const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(onResults);

// --- ANIMATION LOOP ---
function updateCursor() {
    cursorX += (targetX - cursorX) * lerpFactor;
    cursorY += (targetY - cursorY) * lerpFactor;
    
    cursor.style.left = `${cursorX}px`;
    cursor.style.top = `${cursorY}px`;
    
    requestAnimationFrame(updateCursor);
}
updateCursor();

// --- CAMERA SETUP ---
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720
});

startBtn.addEventListener('click', () => {
    startOverlay.style.opacity = '0';
    setTimeout(() => {
        startOverlay.style.display = 'none';
        camera.start();
    }, 500);
});
