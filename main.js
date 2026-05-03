import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const cursor = document.getElementById('hand-cursor');
const statusText = document.getElementById('tracking-status');
const landmarkCountEl = null; // Removed in UI
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

// --- INTERACTION LOGIC ---
const PINCH_THRESHOLD = 0.05;
let wasPinching = false;

function checkInteractions(isPinching) {
    const icons = document.querySelectorAll('.icon-box');
    let hoveredOne = false;

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
            hoveredOne = true;
            
            // Trigger Click on Pinch Start
            if (isPinching && !wasPinching) {
                icon.classList.add('clicked');
                setTimeout(() => icon.classList.remove('clicked'), 200);
                console.log(`Clicked ${icon.id}`);
            }
        } else {
            icon.classList.remove('hovered');
        }
    });

    wasPinching = isPinching;
}

// --- MEDIAPIPE LOGIC ---
function onResults(results) {
    // Resize monitor canvas to match side panel aspect ratio
    const rect = canvasElement.parentElement.getBoundingClientRect();
    canvasElement.width = rect.width;
    canvasElement.height = rect.height;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the video frame to the monitor canvas
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(results.image, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
    canvasCtx.scale(-1, 1);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusText.innerText = 'TRACKING';
        
        for (const landmarks of results.multiHandLandmarks) {
            // Draw skeleton in monitor
            drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, {color: '#00f2ff', lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, {color: '#fff', lineWidth: 1, radius: 2});
            
            // Get Index Finger Tip (8) and Thumb Tip (4)
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];
            
            // Map to FULL SCREEN (Proportionate)
            // landmarks.x/y is 0-1 relative to the video frame
            targetX = (1 - indexTip.x) * window.innerWidth;
            targetY = indexTip.y * window.innerHeight;
            
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
        // Initialize bubbles
        for (let i = 0; i < 3; i++) createBubble();
    }, 500);
});
