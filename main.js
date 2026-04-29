/**
 * Platker - Main Game Logic
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const mainMenu = document.getElementById('main-menu');

// Configuration
const GRAVITY = 0.5;
const JUMP_FORCE = -12;
const SPEED = 5;

// State
let isPlaying = false;
let player = {
    x: 100,
    y: 100,
    width: 32,
    height: 32,
    velocityX: 0,
    velocityY: 0,
    grounded: false,
    color: '#00f2ff'
};

let platforms = [
    { x: 0, y: 500, width: 800, height: 40 },
    { x: 400, y: 400, width: 200, height: 20 },
    { x: 100, y: 300, width: 200, height: 20 },
    { x: 600, y: 250, width: 150, height: 20 }
];

let keys = {};

// Resize canvas
function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}

window.addEventListener('resize', resize);
resize();

// Input handling
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// Initialization
startBtn.addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    isPlaying = true;
    requestAnimationFrame(gameLoop);
});

function update() {
    if (!isPlaying) return;

    // Movement
    if (keys['KeyA'] || keys['ArrowLeft']) player.velocityX = -SPEED;
    else if (keys['KeyD'] || keys['ArrowRight']) player.velocityX = SPEED;
    else player.velocityX *= 0.8; // Friction

    // Jump
    if ((keys['KeyW'] || keys['ArrowUp'] || keys['Space']) && player.grounded) {
        player.velocityY = JUMP_FORCE;
        player.grounded = false;
    }

    // Apply Gravity
    player.velocityY += GRAVITY;

    // Apply Velocity
    player.x += player.velocityX;
    player.y += player.velocityY;

    // Floor collision (Simple)
    player.grounded = false;
    for (let p of platforms) {
        if (player.x < p.x + p.width &&
            player.x + player.width > p.x &&
            player.y + player.height > p.y &&
            player.y + player.height < p.y + p.height + player.velocityY) {
            
            player.y = p.y - player.height;
            player.velocityY = 0;
            player.grounded = true;
        }
    }

    // Wrap around screen
    if (player.x > canvas.width) player.x = -player.width;
    if (player.x < -player.width) player.x = canvas.width;

    // Reset if fell off
    if (player.y > canvas.height + 100) {
        player.x = 100;
        player.y = 100;
        player.velocityY = 0;
    }
}

function draw() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (Aesthetic)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const step = 40;
    for(let i = 0; i < canvas.width; i+=step) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for(let i = 0; i < canvas.height; i+=step) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Draw Platforms
    ctx.fillStyle = '#151518';
    ctx.strokeStyle = 'rgba(112, 0, 255, 0.5)';
    ctx.lineWidth = 2;
    for (let p of platforms) {
        ctx.fillRect(p.x, p.y, p.width, p.height);
        ctx.strokeRect(p.x, p.y, p.width, p.height);
        
        // Glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(112, 0, 255, 0.3)';
        ctx.strokeRect(p.x, p.y, p.width, p.height);
        ctx.shadowBlur = 0;
    }

    // Draw Player
    ctx.fillStyle = player.color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = player.color;
    ctx.beginPath();
    ctx.roundRect(player.x, player.y, player.width, player.height, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Player eyes (Directional)
    ctx.fillStyle = '#000';
    const eyeOffset = player.velocityX > 0 ? 10 : (player.velocityX < 0 ? 2 : 6);
    ctx.fillRect(player.x + eyeOffset, player.y + 8, 4, 4);
    ctx.fillRect(player.x + eyeOffset + 12, player.y + 8, 4, 4);
}

function gameLoop() {
    update();
    draw();
    if (isPlaying) requestAnimationFrame(gameLoop);
}

// Level Upload Logic (Simulation)
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processImage(file);
    }
});

function processImage(file) {
    dropZone.innerHTML = `
        <div class="uploader-icon" style="animation: spin 2s linear infinite">✦</div>
        <h3>Analyzing Drawing...</h3>
        <p>Our AI is converting your sketch into a playable dimension.</p>
    `;
    
    // Simulate AI processing
    setTimeout(() => {
        // Generate random platforms based on "analysis"
        platforms = [
            { x: 0, y: 500, width: canvas.width, height: 40 },
            { x: Math.random() * 200, y: 400, width: 150, height: 20 },
            { x: Math.random() * 400 + 200, y: 300, width: 150, height: 20 },
            { x: Math.random() * 100 + 500, y: 200, width: 150, height: 20 }
        ];
        
        dropZone.innerHTML = `
            <div class="uploader-icon">✓</div>
            <h3>Dimension Synchronized!</h3>
            <p>Level generated successfully. Jump in!</p>
            <button class="btn btn-primary" onclick="location.reload()">RELOAD GAME</button>
        `;
    }, 2000);
}

// CSS for the spinning icon
const style = document.createElement('style');
style.textContent = `
    @keyframes spin { 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(style);
