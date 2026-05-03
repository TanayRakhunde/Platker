import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const cursor = document.getElementById('hand-cursor');
const statusText = document.getElementById('tracking-status');
const landmarkCountEl = document.getElementById('landmark-count');
const actionEl = document.getElementById('current-action');
const gameContainer = document.getElementById('game-container');
const startBtn = document.getElementById('start-btn');
const startOverlay = document.getElementById('start-overlay');

// --- CURSOR SMOOTHING ---
let cursorX = 0;
let cursorY = 0;
let targetX = 0;
let targetY = 0;
const lerpFactor = 0.2;

// --- GAME STATE ---
let bubbles = [];
const PINCH_THRESHOLD = 0.05; // Distance between thumb and index

function createBubble() {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerText = 'POP';
    
    const x = Math.random() * (window.innerWidth - 200) + 100;
    const y = Math.random() * (window.innerHeight - 200) + 100;
    
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    
    gameContainer.appendChild(bubble);
    bubbles.push({ el: bubble, x, y, popped: false });
}

function checkInteractions(isPinching) {
    bubbles.forEach(bubble => {
        if (bubble.popped) return;
        
        const dx = cursorX - bubble.x;
        const dy = cursorY - bubble.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 60) {
            bubble.el.classList.add('hovered');
            if (isPinching) {
                bubble.popped = true;
                bubble.el.classList.add('popped');
                setTimeout(() => {
                    bubble.el.remove();
                    createBubble();
                }, 300);
            }
        } else {
            bubble.el.classList.remove('hovered');
        }
    });
}

// --- MEDIAPIPE LOGIC ---
function onResults(results) {
    // Resize canvas
    if (canvasElement.width !== videoElement.videoWidth) {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Custom drawing on the ghost camera feed
    if (results.multiHandLandmarks) {
        statusText.innerText = 'Tracking Active';
        landmarkCountEl.innerText = results.multiHandLandmarks[0].length;
        
        for (const landmarks of results.multiHandLandmarks) {
            // Draw skeleton lines
            canvasCtx.strokeStyle = '#00f2ff';
            canvasCtx.lineWidth = 2;
            // Draw hand visuals
            // (We could use drawConnectors/drawLandmarks here but let's keep it minimal for performance)
            
            // Get Index Finger Tip (Landmark 8) and Thumb Tip (Landmark 4)
            const indexTip = landmarks[8];
            const thumbTip = landmarks[4];
            
            // Map to screen (Mirrored)
            targetX = (1 - indexTip.x) * window.innerWidth;
            targetY = indexTip.y * window.innerHeight;
            
            // Check for pinch
            const dx = indexTip.x - thumbTip.x;
            const dy = indexTip.y - thumbTip.y;
            const dz = indexTip.z - thumbTip.z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            const isPinching = distance < PINCH_THRESHOLD;
            actionEl.innerText = isPinching ? 'Pinching' : 'Floating';
            
            if (isPinching) {
                cursor.style.transform = 'translate(-50%, -50%) scale(0.8)';
            } else {
                cursor.style.transform = 'translate(-50%, -50%) scale(1)';
            }
            
            checkInteractions(isPinching);
        }
    } else {
        statusText.innerText = 'Hand Not Found';
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
