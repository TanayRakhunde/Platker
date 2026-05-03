import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const statusText = document.getElementById('tracking-status');
const canvasCtx = canvasElement.getContext('2d');
const cursorRight = document.getElementById('cursor-right');
const cursorLeft = document.getElementById('cursor-left');
const actionEl = document.getElementById('current-action');
const startBtn = document.getElementById('start-btn');
const startOverlay = document.getElementById('start-overlay');
const sourceArea = document.getElementById('source-text');
const targetArea = document.getElementById('target-text');

// Lab Elements
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const gestureNameInput = document.getElementById('gesture-name');
const captureBtn = document.getElementById('capture-btn');
const recordBtn = document.getElementById('record-btn');
const progressContainer = document.getElementById('record-progress-container');
const progressBar = document.getElementById('record-progress-bar');
const gestureListEl = document.getElementById('gesture-list');

// --- STATE ---
const PINCH_THRESHOLD = 0.06;
const FIST_THRESHOLD = 0.12;
const OPEN_THRESHOLD = 0.25;

let clipboardBuffer = "";
let isRightPinching = false;
let rightHandPos = { x: 0, y: 0 };
let leftHandPos = { x: 0, y: 0 };

// Training State
let gestureLibrary = JSON.parse(localStorage.getItem('handos_gestures') || '[]');
let currentHandLandmarks = null;
let isRecordingMotion = false;
let recordedSequence = [];
let liveBuffer = [];
const BUFFER_SIZE = 40; // ~1.5 seconds at 30fps

// Click tracking
let lastRightPinchTime = 0;
let rightPinchCount = 0;
const TRIPLE_CLICK_WINDOW = 600;

// Snapping state
let wasSnapping = false;

// For selection
let selectionAnchorRange = null;

// --- GESTURE LAB LOGIC ---

function getFeatureVector(landmarks) {
    const wrist = landmarks[0];
    const palmSize = getDistance(wrist, landmarks[5]);
    if (palmSize === 0) return null;
    return landmarks.slice(1).map(lm => getDistance(wrist, lm) / palmSize);
}

function saveGesture(type = 'pose') {
    const name = gestureNameInput.value.trim().toUpperCase();
    if (!name) {
        alert("Enter a name!");
        return;
    }
    
    if (type === 'pose') {
        if (!currentHandLandmarks) return;
        const vector = getFeatureVector(currentHandLandmarks);
        gestureLibrary.push({ name, type: 'pose', vector });
    } else {
        if (recordedSequence.length < 10) return;
        gestureLibrary.push({ name, type: 'motion', sequence: recordedSequence });
    }

    localStorage.setItem('handos_gestures', JSON.stringify(gestureLibrary));
    renderGestureList();
    gestureNameInput.value = "";
    recordedSequence = [];
}

async function startMotionRecording() {
    if (isRecordingMotion) return;
    
    const name = gestureNameInput.value.trim();
    if (!name) {
        alert("Enter a name first!");
        return;
    }

    isRecordingMotion = true;
    recordedSequence = [];
    progressContainer.classList.remove('hidden');
    
    let startTime = Date.now();
    const duration = 2000; // 2 seconds

    const recordInterval = setInterval(() => {
        let elapsed = Date.now() - startTime;
        let progress = (elapsed / duration) * 100;
        progressBar.style.width = `${progress}%`;

        if (currentHandLandmarks) {
            const vector = getFeatureVector(currentHandLandmarks);
            if (vector) recordedSequence.push(vector);
        }

        if (elapsed >= duration) {
            clearInterval(recordInterval);
            isRecordingMotion = false;
            progressContainer.classList.add('hidden');
            saveGesture('motion');
        }
    }, 50);
}

function renderGestureList() {
    if (gestureLibrary.length === 0) {
        gestureListEl.innerHTML = '<p class="empty-msg">No custom gestures yet.</p>';
        return;
    }
    
    gestureListEl.innerHTML = gestureLibrary.map((g, i) => `
        <div class="gesture-tag" style="border-color: ${g.type === 'motion' ? '#ffaa00' : '#ff00ff'}">
            <span>${g.type === 'motion' ? '🎬' : '🖐️'} ${g.name}</span>
            <button onclick="removeGesture(${i})">×</button>
        </div>
    `).join('');
}

window.removeGesture = (index) => {
    gestureLibrary.splice(index, 1);
    localStorage.setItem('handos_gestures', JSON.stringify(gestureLibrary));
    renderGestureList();
};

function matchGesture(landmarks) {
    const vector = getFeatureVector(landmarks);
    if (!vector) return null;

    // Update live buffer for motion matching
    liveBuffer.push(vector);
    if (liveBuffer.length > BUFFER_SIZE) liveBuffer.shift();

    let bestMatch = null;
    let minDistance = 0.12;

    gestureLibrary.forEach(gesture => {
        if (gesture.type === 'pose') {
            let dist = calculateVectorDistance(vector, gesture.vector);
            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = gesture.name;
            }
        } else if (gesture.type === 'motion' && liveBuffer.length >= 10) {
            // Simple sequence comparison (last frame of motion vs current frame)
            // For a better match, we'd use DTW, but this is a solid heuristic
            const lastSavedFrame = gesture.sequence[gesture.sequence.length - 1];
            const firstSavedFrame = gesture.sequence[0];
            
            let distEnd = calculateVectorDistance(vector, lastSavedFrame);
            let distStart = calculateVectorDistance(liveBuffer[0], firstSavedFrame);
            
            if (distEnd < 0.1 && distStart < 0.15) {
                bestMatch = `MOTION: ${gesture.name}`;
            }
        }
    });

    return bestMatch;
}

function calculateVectorDistance(v1, v2) {
    let distance = 0;
    for (let i = 0; i < v1.length; i++) {
        distance += Math.abs(v1[i] - v2[i]);
    }
    return distance / v1.length;
}

// Tab Switching
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const tabId = `tab-${btn.dataset.tab}`;
        document.getElementById(tabId).classList.add('active');
    });
});

captureBtn.addEventListener('click', () => saveGesture('pose'));
recordBtn.addEventListener('click', startMotionRecording);
renderGestureList();
// --- GESTURE UTILS ---
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
}

function isFist(landmarks) {
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20];
    const fingerBases = [5, 9, 13, 17];
    
    let foldedCount = 0;
    for (let i = 0; i < 4; i++) {
        const tipDist = getDistance(wrist, landmarks[fingerTips[i]]);
        const baseDist = getDistance(wrist, landmarks[fingerBases[i]]);
        if (tipDist < baseDist) foldedCount++;
    }
    return foldedCount >= 3;
}

function isOpen(landmarks) {
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20];
    const fingerBases = [5, 9, 13, 17];
    
    let extendedCount = 0;
    for (let i = 0; i < 4; i++) {
        const tipDist = getDistance(wrist, landmarks[fingerTips[i]]);
        const baseDist = getDistance(wrist, landmarks[fingerBases[i]]);
        if (tipDist > baseDist * 1.3) extendedCount++;
    }
    return extendedCount >= 3;
}

function isSnapping(landmarks) {
    // Snap: Thumb (4) touches Middle Finger (12)
    return getDistance(landmarks[4], landmarks[12]) < PINCH_THRESHOLD;
}

// --- INTERACTION ---
function handleRightHand(landmarks, isPinching) {
    const targetX = (1 - landmarks[8].x) * window.innerWidth;
    const targetY = landmarks[8].y * window.innerHeight;
    
    const currentLerp = isPinching ? 0.08 : 0.3;
    rightHandPos.x += (targetX - rightHandPos.x) * currentLerp;
    rightHandPos.y += (targetY - rightHandPos.y) * currentLerp;
    
    cursorRight.style.left = `${rightHandPos.x}px`;
    cursorRight.style.top = `${rightHandPos.y}px`;
    cursorRight.style.transform = `translate(-50%, -50%) scale(${isPinching ? 0.7 : 1})`;

    if (isPinching) {
        const sel = window.getSelection();
        const range = document.caretRangeFromPoint(rightHandPos.x, rightHandPos.y);
        
        if (range) {
            if (!isRightPinching) {
                // Triple Click Detection
                const now = performance.now();
                if (now - lastRightPinchTime < TRIPLE_CLICK_WINDOW) {
                    rightPinchCount++;
                } else {
                    rightPinchCount = 1;
                }
                lastRightPinchTime = now;

                if (rightPinchCount >= 3) {
                    // SELECT ALL
                    const activeEl = document.activeElement;
                    if (activeEl && activeEl.classList.contains('text-editor')) {
                        const newRange = document.createRange();
                        newRange.selectNodeContents(activeEl);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        actionEl.innerText = "SELECT ALL";
                    }
                    rightPinchCount = 0;
                } else {
                    selectionAnchorRange = range.cloneRange();
                    sel.removeAllRanges();
                }
            } else {
                // Dragging selection
                const newRange = document.createRange();
                if (selectionAnchorRange && selectionAnchorRange.compareBoundaryPoints(Range.START_TO_START, range) <= 0) {
                    newRange.setStart(selectionAnchorRange.startContainer, selectionAnchorRange.startOffset);
                    newRange.setEnd(range.startContainer, range.startOffset);
                } else if (selectionAnchorRange) {
                    newRange.setStart(range.startContainer, range.startOffset);
                    newRange.setEnd(selectionAnchorRange.startContainer, selectionAnchorRange.startOffset);
                }
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
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
    const snapping = isSnapping(landmarks);

    if (fist) {
        const selection = window.getSelection().toString();
        if (selection && selection.length > 0) {
            clipboardBuffer = selection;
            actionEl.innerText = "COPIED!";
            cursorLeft.style.transform = "translate(-50%, -50%) scale(0.6)";
        }
    } else if (open) {
        // Restricted Paste: Only in targetArea
        if (clipboardBuffer && actionEl.innerText !== "PASTED!") {
            const activeEl = document.activeElement;
            if (activeEl === targetArea) {
                activeEl.innerText += clipboardBuffer;
                actionEl.innerText = "PASTED!";
                cursorLeft.style.transform = "translate(-50%, -50%) scale(1.3)";
            }
        }
    } else if (snapping && !wasSnapping) {
        // Restricted Backspace: Only in targetArea
        const activeEl = document.activeElement;
        if (activeEl === targetArea) {
            const selection = window.getSelection();
            if (!selection.isCollapsed && selection.anchorNode.parentElement === targetArea) {
                selection.deleteFromDocument();
            } else {
                activeEl.innerText = activeEl.innerText.slice(0, -1);
            }
            actionEl.innerText = "DELETE";
            cursorLeft.style.transform = "translate(-50%, -50%) rotate(-45deg)";
        }
    } else {
        if (actionEl.innerText !== "IDLE" && !snapping) {
            setTimeout(() => actionEl.innerText = "IDLE", 1000);
        }
        cursorLeft.style.transform = "translate(-50%, -50%) scale(1)";
    }
    wasSnapping = snapping;
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
            const rawLabel = results.multiHandedness[index].label; 
            const label = rawLabel === 'Right' ? 'Left' : 'Right';
            
            // Cache for Lab
            currentHandLandmarks = landmarks;

            // Draw skeleton
            const color = label === 'Right' ? '#00f2ff' : '#ff00ff';
            drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, {color: color, lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, {color: '#fff', lineWidth: 1, radius: 2});
            
            // CUSTOM GESTURE MATCHING
            const customMatch = matchGesture(landmarks);
            if (customMatch) {
                actionEl.innerText = customMatch;
            }

            const isPinching = getDistance(landmarks[4], landmarks[8]) < PINCH_THRESHOLD;

            if (label === 'Right') {
                handleRightHand(landmarks, isPinching);
            } else {
                handleLeftHand(landmarks);
            }
        });
    } else {
        statusText.innerText = 'OFFLINE';
        currentHandLandmarks = null;
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
