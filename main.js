import { Hands } from '@mediapipe/hands';
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
const BUFFER_SIZE = 40;

// Action Control
let lastActionTime = 0;
const ACTION_COOLDOWN = 1500; 

// Selection tracking
let lastRightPinchTime = 0;
let rightPinchCount = 0;
const TRIPLE_CLICK_WINDOW = 600;
let selectionAnchorRange = null;
let wasSnapping = false;

// --- GESTURE LAB LOGIC ---

function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
}

function getFeatureVector(landmarks) {
    const wrist = landmarks[0];
    const palmSize = getDistance(wrist, landmarks[5]);
    if (palmSize === 0) return null;
    return landmarks.slice(1).map(lm => getDistance(wrist, lm) / palmSize);
}

function calculateVectorDistance(v1, v2) {
    let distance = 0;
    for (let i = 0; i < v1.length; i++) {
        distance += Math.abs(v1[i] - v2[i]);
    }
    return distance / v1.length;
}

function executeCommand(command) {
    if (!command) return;
    const cmd = command.toLowerCase();
    console.log(`Executing AI Intent: ${cmd}`);

    if (cmd.startsWith('open ')) {
        let url = cmd.replace('open ', '').trim();
        if (!url.startsWith('http')) url = 'https://' + url;
        window.open(url, '_blank');
    } else if (cmd.includes('scroll down')) {
        window.scrollBy({ top: 500, behavior: 'smooth' });
    } else if (cmd.includes('scroll up')) {
        window.scrollBy({ top: -500, behavior: 'smooth' });
    } else if (cmd.includes('reload') || cmd.includes('refresh')) {
        location.reload();
    } else if (cmd.includes('clear')) {
        targetArea.innerText = "";
    }
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
    const duration = 2000;

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

function updateGestureCommand(index, command) {
    gestureLibrary[index].command = command;
    localStorage.setItem('handos_gestures', JSON.stringify(gestureLibrary));
}

function saveGesture(type = 'pose') {
    const name = gestureNameInput.value.trim().toUpperCase();
    if (!name) return;
    
    if (type === 'pose') {
        if (!currentHandLandmarks) return;
        const vector = getFeatureVector(currentHandLandmarks);
        gestureLibrary.push({ name, type: 'pose', vector, command: "" });
    } else {
        if (recordedSequence.length < 10) return;
        gestureLibrary.push({ name, type: 'motion', sequence: recordedSequence, command: "" });
    }

    localStorage.setItem('handos_gestures', JSON.stringify(gestureLibrary));
    renderGestureList();
    gestureNameInput.value = "";
    recordedSequence = [];
}

function renderGestureList() {
    if (!gestureListEl) return;
    if (gestureLibrary.length === 0) {
        gestureListEl.innerHTML = '<p class="empty-msg">No custom gestures yet.</p>';
        return;
    }
    
    gestureListEl.innerHTML = gestureLibrary.map((g, i) => `
        <div class="gesture-item">
            <div class="gesture-info">
                <strong>${g.type === 'motion' ? '🎬' : '🖐️'} ${g.name}</strong>
                <span class="gesture-type-tag">${g.type.toUpperCase()}</span>
            </div>
            <div class="command-mapping">
                <input type="text" 
                       class="command-input" 
                       placeholder="AI Command" 
                       value="${g.command || ''}"
                       onchange="updateGestureCommand(${i}, this.value)">
                <button class="delete-btn" onclick="removeGesture(${i})">DELETE</button>
            </div>
        </div>
    `).join('');
}

window.updateGestureCommand = updateGestureCommand;
window.removeGesture = (index) => {
    gestureLibrary.splice(index, 1);
    localStorage.setItem('handos_gestures', JSON.stringify(gestureLibrary));
    renderGestureList();
};

function matchGesture(landmarks) {
    const vector = getFeatureVector(landmarks);
    if (!vector) return null;

    liveBuffer.push(vector);
    if (liveBuffer.length > BUFFER_SIZE) liveBuffer.shift();

    let bestMatch = null;
    let minDistance = 0.12;

    gestureLibrary.forEach(gesture => {
        if (gesture.type === 'pose') {
            let dist = calculateVectorDistance(vector, gesture.vector);
            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = gesture;
            }
        } else if (gesture.type === 'motion' && liveBuffer.length >= 10) {
            const lastSavedFrame = gesture.sequence[gesture.sequence.length - 1];
            const firstSavedFrame = gesture.sequence[0];
            let distEnd = calculateVectorDistance(vector, lastSavedFrame);
            let distStart = calculateVectorDistance(liveBuffer[0], firstSavedFrame);
            if (distEnd < 0.1 && distStart < 0.15) bestMatch = gesture;
        }
    });

    if (bestMatch) {
        const now = Date.now();
        if (now - lastActionTime > ACTION_COOLDOWN) {
            executeCommand(bestMatch.command);
            lastActionTime = now;
        }
        return bestMatch.name;
    }
    return null;
}

// --- INTERACTION LOGIC ---

function isFist(landmarks) {
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20];
    const fingerBases = [5, 9, 13, 17];
    let foldedCount = 0;
    for (let i = 0; i < 4; i++) {
        if (getDistance(wrist, landmarks[fingerTips[i]]) < getDistance(wrist, landmarks[fingerBases[i]])) foldedCount++;
    }
    return foldedCount >= 3;
}

function isOpen(landmarks) {
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20];
    const fingerBases = [5, 9, 13, 17];
    let extendedCount = 0;
    for (let i = 0; i < 4; i++) {
        if (getDistance(wrist, landmarks[fingerTips[i]]) > getDistance(wrist, landmarks[fingerBases[i]]) * 1.3) extendedCount++;
    }
    return extendedCount >= 3;
}

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
                const now = performance.now();
                if (now - lastRightPinchTime < TRIPLE_CLICK_WINDOW) rightPinchCount++;
                else rightPinchCount = 1;
                lastRightPinchTime = now;

                if (rightPinchCount >= 3) {
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
            } else if (selectionAnchorRange) {
                const newRange = document.createRange();
                if (selectionAnchorRange.compareBoundaryPoints(Range.START_TO_START, range) <= 0) {
                    newRange.setStart(selectionAnchorRange.startContainer, selectionAnchorRange.startOffset);
                    newRange.setEnd(range.startContainer, range.startOffset);
                } else {
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

let wasFist = false;
let wasOpen = false;
let wasSnapping = false;

function handleLeftHand(landmarks) {
    const targetX = (1 - landmarks[8].x) * window.innerWidth;
    const targetY = landmarks[8].y * window.innerHeight;
    leftHandPos.x += (targetX - leftHandPos.x) * 0.3;
    leftHandPos.y += (targetY - leftHandPos.y) * 0.3;
    cursorLeft.style.left = `${leftHandPos.x}px`;
    cursorLeft.style.top = `${leftHandPos.y}px`;

    const fist = isFist(landmarks);
    const open = isOpen(landmarks);
    const snapping = getDistance(landmarks[4], landmarks[12]) < PINCH_THRESHOLD;

    // --- EDGE TRIGGERED LOGIC (FIRE ONCE PER GESTURE) ---

    // 1. SNAP (DELETE) - Highest Priority
    if (snapping && !wasSnapping) {
        if (document.activeElement === targetArea) {
            const selection = window.getSelection();
            if (!selection.isCollapsed) selection.deleteFromDocument();
            else targetArea.innerText = targetArea.innerText.slice(0, -1);
            actionEl.innerText = "DELETE";
            console.log("HandOS: Snap Delete Triggered");
        }
    }

    // 2. FIST (COPY) - Only if not snapping
    if (fist && !wasFist && !snapping) {
        const selection = window.getSelection().toString();
        if (selection) {
            clipboardBuffer = selection;
            actionEl.innerText = "COPIED!";
            console.log("HandOS: Copy Triggered");
        }
    }

    // 3. OPEN (PASTE) - Only if not snapping and was previously closed
    if (open && !wasOpen && !fist && !snapping) {
        if (clipboardBuffer && document.activeElement === targetArea) {
            targetArea.innerText += clipboardBuffer;
            actionEl.innerText = "PASTED!";
            console.log("HandOS: Paste Triggered");
        }
    }

    // Reset Action Label
    if (!fist && !open && !snapping) {
        if (actionEl.innerText !== "IDLE" && actionEl.innerText !== "ONLINE") {
            setTimeout(() => {
                if (!isFist(landmarks) && !isOpen(landmarks)) actionEl.innerText = "IDLE";
            }, 800);
        }
    }

    // Store states for next frame
    wasFist = fist;
    wasOpen = open;
    wasSnapping = snapping;
}

// --- SYSTEM SETUP ---

const cameraSelect = document.getElementById('camera-select');

async function getCameras() {
    try {
        // Request permission to see labels, then immediately release
        const stream = await navigator.mediaDevices.getUserMedia({ video: true }); 
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // STOP the temporary stream so the camera isn't "Busy"
        stream.getTracks().forEach(track => track.stop());

        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        const sortedDevices = videoDevices.sort((a, b) => {
            const aLabel = (a.label || "").toLowerCase();
            const bLabel = (b.label || "").toLowerCase();
            
            const isAUsb = aLabel.includes('usb') || aLabel.includes('external') || aLabel.includes('cam');
            const isBUsb = bLabel.includes('usb') || bLabel.includes('external') || bLabel.includes('cam');
            const isAVirtual = aLabel.includes('obs') || aLabel.includes('virtual');
            const isBVirtual = bLabel.includes('obs') || bLabel.includes('virtual');

            if (isAUsb && !isBUsb) return -1;
            if (!isAUsb && isBUsb) return 1;
            if (isAVirtual && !isBVirtual) return 1;
            if (!isAVirtual && isBVirtual) return -1;
            return 0;
        });

        if (sortedDevices.length === 0) {
            cameraSelect.innerHTML = '<option value="">No Camera Found</option>';
            return;
        }

        cameraSelect.innerHTML = sortedDevices.map(d => 
            `<option value="${d.deviceId}">${d.label || `Camera ${videoDevices.indexOf(d) + 1}`}</option>`
        ).join('');

        cameraSelect.selectedIndex = 0;
    } catch (e) {
        console.error("HandOS: Camera scan failed", e);
        cameraSelect.innerHTML = '<option value="">Camera Blocked / Not Found</option>';
    }
}

// Listen for hardware changes (Plug/Unplug)
navigator.mediaDevices.addEventListener('devicechange', () => {
    console.log("HandOS: Hardware Change Detected...");
    getCameras();
});

let activeStream = null;

async function startCamera(deviceId) {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: 1280,
            height: 720
        }
    };

    try {
        activeStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = activeStream;
        videoElement.play();
        
        requestAnimationFrame(processFrame);
    } catch (e) {
        console.error("Failed to start camera", e);
        statusText.innerText = "ERROR: SENSOR BLOCKED";
    }
}

async function processFrame() {
    if (!activeStream || videoElement.paused || videoElement.ended) return;
    await hands.send({ image: videoElement });
    requestAnimationFrame(processFrame);
}

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
            const label = results.multiHandedness[index].label === 'Right' ? 'Left' : 'Right';
            currentHandLandmarks = landmarks;
            const color = label === 'Right' ? '#00f2ff' : '#ff00ff';
            drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, {color: color, lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, {color: '#fff', lineWidth: 1, radius: 2});
            
            const customMatch = matchGesture(landmarks);
            if (customMatch) actionEl.innerText = customMatch;

            const isPinching = getDistance(landmarks[4], landmarks[8]) < PINCH_THRESHOLD;
            if (label === 'Right') handleRightHand(landmarks, isPinching);
            else handleLeftHand(landmarks);
        });
    } else {
        statusText.innerText = 'OFFLINE';
        currentHandLandmarks = null;
    }
    canvasCtx.restore();
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands.onResults(onResults);

// Initialization
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

captureBtn.addEventListener('click', () => saveGesture('pose'));
recordBtn.addEventListener('click', startMotionRecording);

startBtn.addEventListener('click', () => {
    const deviceId = cameraSelect.value;
    console.log(`HandOS: Launching Sensor (${deviceId})...`);
    
    startOverlay.style.opacity = '0';
    setTimeout(() => {
        startOverlay.style.display = 'none';
        startCamera(deviceId);
    }, 500);
});

// Load camera list on boot
getCameras();
renderGestureList();
