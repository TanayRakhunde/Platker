import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const cursorRight = document.getElementById('cursor-right');
const cursorLeft = document.getElementById('cursor-left');
const actionEl = document.getElementById('current-action');
const startBtn = document.getElementById('start-btn');
const startOverlay = document.getElementById('start-overlay');
const sourceArea = document.getElementById('source-text');
const targetArea = document.getElementById('target-text');

// --- STATE ---
const PINCH_THRESHOLD = 0.06;
const FIST_THRESHOLD = 0.12;
const OPEN_THRESHOLD = 0.25;

let clipboardBuffer = "";
let isRightPinching = false;
let rightHandPos = { x: 0, y: 0 };
let leftHandPos = { x: 0, y: 0 };

// --- GESTURE UTILS ---
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
}

function isFist(landmarks) {
    const palm = landmarks[0];
    const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
    const avgDist = tips.reduce((sum, tip) => sum + getDistance(palm, tip), 0) / 4;
    return avgDist < FIST_THRESHOLD;
}

function isOpen(landmarks) {
    const palm = landmarks[0];
    const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
    const avgDist = tips.reduce((sum, tip) => sum + getDistance(palm, tip), 0) / 4;
    return avgDist > OPEN_THRESHOLD;
}

// --- INTERACTION ---
function handleRightHand(landmarks, isPinching) {
    const targetX = (1 - landmarks[8].x) * window.innerWidth;
    const targetY = landmarks[8].y * window.innerHeight;
    
    // Smooth movement
    rightHandPos.x += (targetX - rightHandPos.x) * 0.3;
    rightHandPos.y += (targetY - rightHandPos.y) * 0.3;
    
    cursorRight.style.left = `${rightHandPos.x}px`;
    cursorRight.style.top = `${rightHandPos.y}px`;
    cursorRight.style.transform = `translate(-50%, -50%) scale(${isPinching ? 0.7 : 1})`;

    // Simulate Selection if pinching on textarea
    if (isPinching) {
        const el = document.elementFromPoint(rightHandPos.x, rightHandPos.y);
        if (el === sourceArea || el === targetArea) {
            el.focus();
        }
    }
    isRightPinching = isPinching;
}

function handleLeftHand(landmarks) {
    const targetX = (1 - landmarks[8].x) * window.innerWidth;
    const targetY = landmarks[8].y * window.innerHeight;
    
    leftHandPos.x += (targetX - leftHandPos.x) * 0.3;
    leftHandPos.y += (targetY - leftHandPos.y) * 0.3;
    
    cursorLeft.style.left = `${leftHandPos.x}px`;
    cursorLeft.style.top = `${leftHandPos.y}px`;

    const fist = isFist(landmarks);
    const open = isOpen(landmarks);

    if (fist) {
        // Copy action
        const selection = window.getSelection().toString();
        if (selection) {
            clipboardBuffer = selection;
            actionEl.innerText = "COPIED!";
            cursorLeft.style.transform = "translate(-50%, -50%) scale(0.6)";
        }
    } else if (open) {
        // Paste action
        if (clipboardBuffer && actionEl.innerText !== "PASTED!") {
            targetArea.value += clipboardBuffer;
            actionEl.innerText = "PASTED!";
            cursorLeft.style.transform = "translate(-50%, -50%) scale(1.3)";
        }
    } else {
        actionEl.innerText = "IDLE";
        cursorLeft.style.transform = "translate(-50%, -50%) scale(1)";
    }
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
        statusText.innerText = 'ONLINE';
        
        results.multiHandLandmarks.forEach((landmarks, index) => {
            const label = results.multiHandedness[index].label; // "Left" or "Right"
            
            // Draw skeleton
            const color = label === 'Right' ? '#00f2ff' : '#ff00ff';
            drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, {color: color, lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, {color: '#fff', lineWidth: 1, radius: 2});
            
            const isPinching = getDistance(landmarks[4], landmarks[8]) < PINCH_THRESHOLD;

            if (label === 'Right') {
                handleRightHand(landmarks, isPinching);
            } else {
                handleLeftHand(landmarks);
            }
        });
    } else {
        statusText.innerText = 'OFFLINE';
    }
    canvasCtx.restore();
}

const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(onResults);

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
