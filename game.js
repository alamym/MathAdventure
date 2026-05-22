const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const roomDisplay = document.getElementById('room-num');
const targetLabel = document.getElementById('target-label');
const targetValDisplay = document.getElementById('target-val');
const hpDisplay = document.getElementById('hp');
const checklistDisplay = document.getElementById('checklist-items');
const scoreDisplay = document.getElementById('score');
const goalScoreDisplay = document.getElementById('goal-score'); // Added for clarity

const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
const factorChecklist = document.getElementById('factor-checklist');
const instructions = document.getElementById('instructions');
const startButton = document.getElementById('start-button');
const nameInputContainer = document.getElementById('name-input-container'); // Leaderboard input
const playerNameInput = document.getElementById('player-name-input');
const submitScoreBtn = document.getElementById('submit-score-btn');
const gameContainer = document.getElementById('game-container'); // For responsive sizing

// --- Responsive Canvas Setup ---
let scale = 1; // Initial scale, will be adjusted

function resizeCanvas() {
    const containerWidth = gameContainer.offsetWidth;
    const containerHeight = gameContainer.offsetHeight;
    const aspectRatio = 800 / 500; // Original aspect ratio of the game

    let newWidth, newHeight;

    // Calculate dimensions based on aspect ratio and container size
    if (containerWidth / containerHeight > aspectRatio) {
        // Container is wider than game aspect ratio
        newHeight = containerHeight;
        newWidth = newHeight * aspectRatio;
    } else {
        // Container is taller than game aspect ratio
        newWidth = containerWidth;
        newHeight = newWidth / aspectRatio;
    }

    canvas.width = newWidth;
    canvas.height = newHeight;
    scale = newWidth / 800; // Calculate scale factor based on original width

    // Optional: Adjust UI elements based on scale if needed
    // Example: Adjust font sizes, button sizes etc.
    // For now, let CSS handle most of the UI adaptation.
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial resize

// --- Game State Variables ---
let gameState = 'MENU'; // MENU, PLAYING, WIN, GAMEOVER
let roomCount = 1;
let cycleCount = 1;
let score = 0;
let hp = 3;
let targetNum = 0;
let factorsToFind = [];
let foundFactors = [];
let gameActive = true;
let doorOpen = false;

let startTime = 0;
let elapsedTime = 0;

let isEntering = false;
let isExiting = false;
let isBossMode = false;
let bossHp = 100;
let bossShake = 0;

const player = {
    x: -50, // Start off-screen
    y: 400, // Start at bottom
    width: 25,
    height: 40,
    color: '#0f380f', // Darkest green
    speed: 6
};

// Mouse/Touch input
const mouse = { x: 0, y: 0 };
let lastShot = { x: 0, y: 0, timer: 0 };
let isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// Game Objects
let gameObjects = []; // Numbers to hit
let bossMultiplesPool = [];

// Leaderboard
const leaderboardKey = 'math_adventure_scores'; // LocalStorage key
let playerName = ''; // Player's name for the leaderboard

// --- Input Handling ---
const keys = {};

window.addEventListener('keydown', e => {
    if (gameState === 'PLAYING' && gameActive && !isEntering && !isExiting) {
        keys[e.code] = true;
    }
    // Allow Space to restart after game over
    if ((gameState === 'WIN' || gameState === 'GAMEOVER') && e.code === 'Space') {
        keys[e.code] = true;
    }
});

window.addEventListener('keyup', e => {
    if (gameState === 'PLAYING' || gameState === 'WIN' || gameState === 'GAMEOVER') {
        keys[e.code] = false;
    }
});

canvas.addEventListener('mousemove', e => {
    if (gameState !== 'PLAYING' || !gameActive || isEntering || isExiting) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / scale; // Adjust for canvas scaling
    mouse.y = (e.clientY - rect.top) / scale;  // Adjust for canvas scaling
});

canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return; // Only left-click
    if (gameState !== 'PLAYING' || !gameActive || isEntering || isExiting) return;
    handleShot(mouse.x, mouse.y);
});

// Touch support
canvas.addEventListener('touchstart', e => {
    if (gameState !== 'PLAYING' || !gameActive || isEntering || isExiting) return;
    e.preventDefault(); // Prevent default touch actions
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouse.x = (touch.clientX - rect.left) / scale;
    mouse.y = (touch.clientY - rect.top) / scale;
    handleShot(mouse.x, mouse.y);
});

startButton.addEventListener('click', () => {
    if (gameState === 'MENU') {
        startGame();
    } else if (gameState === 'WIN' || gameState === 'GAMEOVER') {
        resetGame();
    }
});

submitScoreBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name && gameState === 'WIN') { // Only submit from WIN state
        saveToLeaderboard(score, Math.floor(elapsedTime / 1000), cycleCount, name);
        nameInputContainer.style.display = 'none';
        gameState = 'LEADERBOARD'; // Move to a state to display leaderboard
        showLeaderboardScreen(); // Show the scores
    } else if (name && gameState === 'GAMEOVER') { // Also allow submission from game over
        saveToLeaderboard(score, Math.floor(elapsedTime / 1000), cycleCount, name);
        nameInputContainer.style.display = 'none';
        showGameOverScreen(); // Show the game over screen again after submission
    }
});


// --- Game Logic Functions ---
function startGame() {
    gameState = 'PLAYING';
    gameActive = true;
    startScreen.style.display = 'none';
    hud.style.display = 'flex';
    factorChecklist.style.display = 'block';
    instructions.style.display = 'block';

    roomCount = 1;
    cycleCount = 1;
    score = 0;
    hp = 3;
    startTime = Date.now();
    elapsedTime = 0;

    initRoom();
}

function resetGame() {
    gameState = 'MENU';
    gameActive = true;
    startScreen.style.display = 'flex';
    hud.style.display = 'none';
    factorChecklist.style.display = 'none';
    instructions.style.display = 'none';
    nameInputContainer.style.display = 'none'; // Hide leaderboard input on reset

    hp = 3;
    score = 0;
    roomCount = 1;
    cycleCount = 1;
    // Reset other game variables if needed
}

function getFactors(n) {
    const f = [];
    for (let i = 1; i <= n; i++) {
        if (n % i === 0) f.push(i);
    }
    return f;
}

function checkOverlap(x, y, others) {
    for (let obj of others) {
        const dx = x - (obj.x + obj.width / 2);
        const dy = y - (obj.y + obj.height / 2);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 75) return true; // Increased collision buffer slightly
    }
    return false;
}

function initRoom() {
    isBossMode = (roomCount % 5 === 0);
    isEntering = true;
    isExiting = false;
    player.x = -50; // Reset player position
    player.y = canvas.height / 2; // Center vertically

    if (isBossMode) {
        targetLabel.innerText = "Hit Multiples of:";
        initBossMode();
    } else {
        targetLabel.innerText = "Find Factors:";
        initNormalMode();
    }
    updateUI(); // Initial UI update for the new room
}

function initNormalMode() {
    let maxNum = 20 + (cycleCount * 10);
    targetNum = Math.floor(Math.random() * (maxNum - 10)) + 10;

    let allFactors = getFactors(targetNum);
    let minF = cycleCount === 1 ? 2 : 6;
    let maxF = cycleCount === 1 ? 6 : 8;

    if (allFactors.length <= minF) {
        factorsToFind = allFactors;
    } else {
        const count = Math.min(allFactors.length, Math.floor(Math.random() * (maxF - minF + 1)) + minF);
        factorsToFind = [];
        const shuffled = [...allFactors].sort(() => 0.5 - Math.random());
        for(let i = 0; i < count; i++) {
            factorsToFind.push(shuffled[i]);
        }
    }

    foundFactors = [];
    doorOpen = false;
    gameObjects = [];
    const numbersForThisRoom = new Set();
    factorsToFind.forEach(f => numbersForThisRoom.add(f));

    const initialDistractorCount = 6 + cycleCount;
    let attempts = 0;

    // Fill with distractors if needed
    while (numbersForThisRoom.size < factorsToFind.length + initialDistractorCount && attempts < 200) {
        let n = Math.floor(Math.random() * maxNum) + 1;
        if (!factorsToFind.includes(n) && !numbersForThisRoom.has(n)) {
            numbersForThisRoom.add(n);
        }
        attempts++;
    }

    // Add objects to canvas
    Array.from(numbersForThisRoom).forEach(num => {
        let posX, posY;
        attempts = 0;
        do {
            posX = Math.random() * (canvas.width - 100) + 50; // Within canvas bounds, considering object size
            posY = Math.random() * (canvas.height - 150) + 75; // Keep some space from top/bottom
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 100);
        gameObjects.push({ x: posX, y: posY, width: 40, height: 40, number: num, isDistractor: !factorsToFind.includes(num) });
    });
}

function initBossMode() {
    bossHp = 100;
    let baseOffset = (cycleCount - 1) * 10;
    targetNum = (baseOffset === 0 ? 2 : baseOffset + 1) + Math.floor(Math.random() * 8); // Multiples range

    gameObjects = [];
    bossMultiplesPool = [];

    const objectPoolSize = 10 + (cycleCount * 2);
    const maxMultiplier = 12;

    for (let i = 0; i < objectPoolSize; i++) {
        let num;
        let isDistractor;

        if (Math.random() > 0.4) { // Chance to spawn a multiple
            let multiplier = Math.floor(Math.random() * maxMultiplier) + 1;
            num = targetNum * multiplier;
            isDistractor = false;
        } else { // Spawn a distractor
            do {
                num = Math.floor(Math.random() * (targetNum * maxMultiplier)) + 2;
            } while (num % targetNum === 0); // Ensure it's NOT a multiple
            isDistractor = true;
        }

        let posX, posY;
        let attempts = 0;
        do {
            posX = Math.random() * (canvas.width - 150) + 75; // Position within canvas
            posY = Math.random() * (canvas.height - 150) + 75;
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 100);

        gameObjects.push({
            x: posX,
            y: posY,
            width: 45,
            height: 45,
            number: num,
            isDistractor: isDistractor
        });
    }
}

function handleShot(sx, sy) {
    if (!gameActive) return;

    // Register shot for visual feedback
    lastShot = { x: sx, y: sy, timer: 15 }; // Increased timer for visibility

    // Check collision with game objects
    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];
        // Collision detection: check if shot coordinates are within object bounds
        if (sx >= obj.x && sx <= obj.x + obj.width && sy >= obj.y && sy <= obj.y + obj.height) {
            if (!obj.isDistractor) {
                if (isBossMode) {
                    bossHp -= 20;
                    bossShake = 15; // More pronounced shake
                    score += 50;
                    if (bossHp <= 0) {
                        score += 500; // Bonus for defeating boss
                        isExiting = true; // Trigger level exit
                        gameObjects = []; // Clear objects for transition
                        return;
                    }
                    gameObjects.splice(i, 1); // Remove the hit multiple
                } else {
                    // Normal mode: hitting a factor
                    if (!foundFactors.includes(obj.number)) {
                        foundFactors.push(obj.number);
                        score += 20;
                        if (foundFactors.length === factorsToFind.length) {
                            doorOpen = true; // Open the exit door
                            isExiting = true; // Start exiting level
                            gameObjects = []; // Clear objects before exit
                        }
                    }
                }
            } else {
                // Hit a distractor
                hp--;
                score = Math.max(0, score - 15); // Penalty for hitting wrong number
                updateHP();
            }
            scoreDisplay.innerText = score;
            if (!isBossMode) gameObjects.splice(i, 1); // Remove object in normal mode after hit
            break; // Only one object can be hit per shot
        }
    }
}

function updateUI() {
    roomDisplay.innerText = isBossMode ? `BOSS MODE (Cycle ${cycleCount})` : `Room ${roomCount} (Cycle ${cycleCount})`;
    targetValDisplay.innerText = targetNum;
    updateChecklist();
    updateHP();
    goalScoreDisplay.innerText = 1000 + (cycleCount * 200); // Increasing goal score
}

function updateChecklist() {
    if (isBossMode) {
        checklistDisplay.innerHTML = `Boss HP: ${Math.max(0, bossHp)}%`;
    } else {
        const remaining = factorsToFind.length - foundFactors.length;
        checklistDisplay.innerHTML = `Need ${remaining} more factor(s)`;
    }
}

function updateHP() {
    hpDisplay.innerText = "❤".repeat(hp);
    if (hp <= 0) {
        gameOver();
    }
}

function gameOver() {
    gameActive = false;
    gameState = 'GAMEOVER';
    // Show game over screen with options to submit score or restart
    showGameOverScreen();
}

function winGame() {
    gameActive = false;
    gameState = 'WIN';
    // Show win screen with options to submit score or play again
    showWinScreen();
}

function showLeaderboardScreen() {
    hud.style.display = 'none';
    factorChecklist.style.display = 'none';
    instructions.style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas for static display

    ctx.fillStyle = "rgba(15, 56, 15, 0.9)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#9bbc0f'; // Light green
    ctx.textAlign = "center";
    ctx.font = `bold ${scale * 40}px Arial`;
    ctx.fillText("HIGH SCORES", canvas.width / 2, 90 / scale);

    ctx.font = `${scale * 26}px Arial`;
    const lb = getLeaderboard();
    if (lb.length === 0) {
        ctx.fillText("No records yet!", canvas.width / 2, 150 / scale);
    } else {
        lb.forEach((entry, i) => {
            ctx.font = `${scale * 20}px Arial`;
            ctx.fillText(`#${i+1} - ${entry.name}: ${entry.score} (Lvl ${entry.level}) - ${entry.time}s`, canvas.width / 2, 150 / scale + (i * 30 / scale));
        });
    }

    ctx.font = `${scale * 22}px Arial`;
    ctx.fillText("Press [Space] to play again", canvas.width / 2, canvas.height - 50 / scale);
}

function showGameOverScreen() {
    hud.style.display = 'none';
    factorChecklist.style.display = 'none';
    instructions.style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas for static display

    ctx.fillStyle = "rgba(15, 56, 15, 0.9)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#d40000'; // Red for game over
    ctx.textAlign = "center";
    ctx.font = `bold ${scale * 40}px Arial`;
    ctx.fillText("WARRIOR FALLEN", canvas.width / 2, 90 / scale);

    ctx.fillStyle = '#9bbc0f'; // Light green
    ctx.font = `${scale * 26}px Arial`;
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, 150 / scale);
    ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s | Cycle: ${cycleCount}`, canvas.width / 2, 190 / scale);

    ctx.font = `${scale * 22}px Arial`;
    ctx.fillText("Press [Space] to restart", canvas.width / 2, canvas.height - 50 / scale);
}

function showWinScreen() {
    hud.style.display = 'none';
    factorChecklist.style.display = 'none';
    instructions.style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas for static display

    ctx.fillStyle = "rgba(15, 56, 15, 0.9)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#9bbc0f'; // Light green
    ctx.textAlign = "center";
    ctx.font = `bold ${scale * 40}px Arial`;
    ctx.fillText("MISSION ACCOMPLISHED!", canvas.width / 2, 90 / scale);

    ctx.font = `${scale * 26}px Arial`;
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, 150 / scale);
    ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s | Final Cycle: ${cycleCount}`, canvas.width / 2, 190 / scale);

    ctx.font = `${scale * 22}px Arial`;
    ctx.fillText("Press [Space] to play again", canvas.width / 2, canvas.height - 50 / scale);
}


// --- Leaderboard Persistence ---
function getLeaderboard() {
    const data = localStorage.getItem(leaderboardKey);
    return data ? JSON.parse(data) : [];
}

function saveToLeaderboard(newScore, time, level, name) {
    const lb = getLeaderboard();
    lb.push({ name: name, score: newScore, time: time, level: level, date: new Date().toLocaleDateString() });
    lb.sort((a, b) => b.score - a.score); // Sort by score descending
    localStorage.setItem(leaderboardKey, JSON.stringify(lb.slice(0, 5))); // Keep top 5
}

// --- Game Loop and Drawing Functions ---
function update() {
    if (gameState !== 'PLAYING' || !gameActive) {
        // Handle transitions from WIN/GAMEOVER/MENU
        if ((gameState === 'WIN' || gameState === 'GAMEOVER') && keys['Space']) {
            resetGame();
        } else if (gameState === 'WIN' || gameState === 'GAMEOVER') {
            return; // Don't update game logic if game ended
        }
    }

    elapsedTime = Date.now() - startTime;

    // Update input timings and screen shake
    if (lastShot.timer > 0) lastShot.timer--;
    if (bossShake > 0) bossShake--;

    // Player Movement and Input
    if (keys['ArrowLeft'] && player.x > 0) player.x -= player.speed * scale;
    if (keys['ArrowRight'] && player.x < canvas.width - player.width * scale) player.x += player.speed * scale;
    if (keys['ArrowUp'] && player.y > 0) player.y -= player.speed * scale;
    if (keys['ArrowDown'] && player.y < canvas.height - player.height * scale) player.y += player.speed * scale;

    // Touch movement (simplified: drag to move)
    if (isTouchDevice && !isEntering && !isExiting && gameState === 'PLAYING') {
        // Basic touch drag movement: could be improved with joystick/virtual buttons
        // For now, mouse events (which are mapped from touch) handle it.
        // Add explicit touch drag logic here if needed.
    }

    // Screen transitions
    if (isEntering) {
        player.x += 4 * scale;
        if (player.x >= 100 * scale) isEntering = false;
    } else if (isExiting) {
        player.x += 5 * scale;
        // Move player towards center for exit sequence
        player.y += (canvas.height / 2 - player.height / 2 - player.y) * 0.1; // Smooth move to center
        if (player.x > canvas.width) {
            score += 50; // Score for completing room/boss
            if (isBossMode) {
                cycleCount++;
            }
            roomCount++;

            if (roomCount > 10 && !isBossMode) { // End game after X rooms without boss, or a certain number of cycles
                 winGame(); // Player won!
            } else {
                initRoom(); // Prepare next room
            }
        }
    } else {
        // Game logic updates only when not in transition
        // Number objects movement or logic would go here if needed
        gameObjects.forEach(obj => {
             // Example: make numbers slowly fall or move
             // obj.y += 0.5 * scale;
             // if (obj.y > canvas.height) obj.y = -obj.height; // Wrap around if falling
        });
    }
}

function drawWarrior(x, y) {
    ctx.fillStyle = player.color;
    ctx.fillRect(x + 6 * scale, y, 12 * scale, 12 * scale);
    ctx.fillRect(x + 2 * scale, y + 12 * scale, 21 * scale, 18 * scale);
    ctx.fillRect(x, y + 15 * scale, 4 * scale, 15 * scale);
    ctx.fillRect(x + 21 * scale, y + 15 * scale, 4 * scale, 15 * scale);
    ctx.fillRect(x + 4 * scale, y + 30 * scale, 6 * scale, 10 * scale);
    ctx.fillRect(x + 15 * scale, y + 30 * scale, 6 * scale, 10 * scale);

    ctx.fillStyle = '#9bbc0f'; // Light green
    ctx.fillRect(x + 8 * scale, y + 4 * scale, 3 * scale, 3 * scale);
    ctx.fillRect(x + 14 * scale, y + 4 * scale, 3 * scale, 3 * scale);
}

function drawBoss() {
    const bx = (canvas.width - 180) + (Math.random() * bossShake);
    const by = 100 + (Math.random() * bossShake);

    ctx.fillStyle = '#0f380f'; // Darkest green
    ctx.beginPath();
    ctx.moveTo(bx, by + 50 * scale); ctx.lineTo(bx + 60 * scale, by); ctx.lineTo(bx + 120 * scale, by + 50 * scale);
    ctx.lineTo(bx + 120 * scale, by + 150 * scale); ctx.lineTo(bx, by + 150 * scale);
    ctx.fill();

    ctx.fillRect(bx + 10 * scale, by - 20 * scale, 15 * scale, 30 * scale);
    ctx.fillRect(bx + 95 * scale, by - 20 * scale, 15 * scale, 30 * scale);

    // Eye
    ctx.fillStyle = bossHp < 50 ? "red" : '#9bbc0f';
    ctx.beginPath(); ctx.arc(bx + 60 * scale, by + 70 * scale, 25 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f380f'; // Darkest green pupil
    ctx.beginPath(); ctx.arc(bx + 60 * scale, by + 70 * scale, 10 * scale, 0, Math.PI * 2); ctx.fill();

    // Health Bar Background
    ctx.fillStyle = '#306230'; // Dark green
    ctx.fillRect(canvas.width - 200 * scale, 50 * scale, 150 * scale, 20 * scale);
    // Health Bar Foreground
    ctx.fillStyle = 'red';
    ctx.fillRect(canvas.width - 200 * scale, 50 * scale, (bossHp / 100) * 150 * scale, 20 * scale);
}

function draw() {
    // Clear canvas and apply scaling
    ctx.save();
    ctx.scale(scale, scale); // Apply scaling for all drawing operations

    ctx.clearRect(0, 0, 800, 500); // Clear original canvas size

    if (gameState === 'MENU') return; // Nothing to draw on menu screen itself (UI handled by HTML)

    // Static border
    ctx.strokeStyle = '#306230'; // Dark green
    ctx.lineWidth = 10 / scale; // Adjust border thickness based on scale
    ctx.strokeRect(5, 5, 800 - 10, 500 - 10); // Draw border relative to original size

    // Timer display
    ctx.fillStyle = '#0f380f'; // Darkest green
    ctx.textAlign = "right";
    ctx.font = `bold ${16 / scale}px Arial`;
    ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s`, 780, 20);

    // Drawing game elements
    if (isBossMode && bossHp > 0) drawBoss();

    // Exit door
    if (doorOpen || isExiting) {
        ctx.fillStyle = '#0f380f'; // Darkest green
        ctx.fillRect(800 - 50, 500/2 - 50, 40, 100);
        ctx.fillStyle = '#9bbc0f'; // Light green
        ctx.font = `bold ${14 / scale}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("EXIT", 800 - 30, 500/2 - 60);
    }

    // Draw Player
    drawWarrior(player.x, player.y);

    // Draw game objects (numbers)
    gameObjects.forEach(obj => {
        ctx.fillStyle = '#0f380f'; // Darkest green
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
        ctx.fillStyle = '#9bbc0f'; // Light green
        ctx.font = `bold ${20 / scale}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(obj.number, obj.x + obj.width / 2, obj.y + obj.height / 2 + 7 / scale);
    });

    // Draw shot trail
    if (lastShot.timer > 0) {
        ctx.save();
        ctx.strokeStyle = '#9bbc0f'; // Light green
        ctx.setLineDash([5 / scale, 5 / scale]);
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.moveTo(player.x + player.width / 2, player.y + player.height / 2);
        ctx.lineTo(lastShot.x, lastShot.y);
        ctx.stroke();
        ctx.restore(); // Restore context state
    }

    // Game Over Screen (drawn on canvas when gameState is GAMEOVER)
    if (gameState === 'GAMEOVER') {
        drawGameOverScreen();
    } else if (gameState === 'WIN') {
        drawWinScreen();
    } else if (gameState === 'LEADERBOARD') {
        drawLeaderboardScreen();
    }

    ctx.restore(); // Restore canvas context
}

// --- Game Screen Drawing Functions ---
function drawGameOverScreen() {
    ctx.fillStyle = "rgba(15, 56, 15, 0.9)"; // Darkest green overlay
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#d40000'; // Red for game over
    ctx.textAlign = "center";
    ctx.font = `bold ${40 / scale}px Arial`;
    ctx.fillText("WARRIOR FALLEN", canvas.width / 2, 90 / scale);

    ctx.fillStyle = '#9bbc0f'; // Light green
    ctx.font = `${26 / scale}px Arial`;
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, 150 / scale);
    ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s | Cycle: ${cycleCount}`, canvas.width / 2, 190 / scale);

    ctx.font = `${22 / scale}px Arial`;
    ctx.fillText("Press [Space] to play again", canvas.width / 2, canvas.height - 50 / scale);
}

function drawWinScreen() {
    ctx.fillStyle = "rgba(15, 56, 15, 0.9)"; // Darkest green overlay
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#9bbc0f'; // Light green
    ctx.textAlign = "center";
    ctx.font = `bold ${40 / scale}px Arial`;
    ctx.fillText("MISSION ACCOMPLISHED!", canvas.width / 2, 90 / scale);

    ctx.font = `${26 / scale}px Arial`;
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, 150 / scale);
    ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s | Final Cycle: ${cycleCount}`, canvas.width / 2, 190 / scale);

    ctx.font = `${22 / scale}px Arial`;
    ctx.fillText("Press [Space] to play again", canvas.width / 2, canvas.height - 50 / scale);
}

function drawLeaderboardScreen() {
    ctx.fillStyle = "rgba(15, 56, 15, 0.9)"; // Darkest green overlay
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#9bbc0f'; // Light green
    ctx.textAlign = "center";
    ctx.font = `bold ${40 / scale}px Arial`;
    ctx.fillText("HIGH SCORES", canvas.width / 2, 90 / scale);

    const lb = getLeaderboard();
    if (lb.length === 0) {
        ctx.font = `${20 / scale}px Arial`;
        ctx.fillText("No records yet!", canvas.width / 2, 150 / scale);
    } else {
        lb.forEach((entry, i) => {
            ctx.font = `${20 / scale}px Arial`;
            ctx.fillText(`#${i+1} - ${entry.name}: ${entry.score} (Lvl ${entry.level}) - ${entry.time}s`, canvas.width / 2, 150 / scale + (i * 30 / scale));
        });
    }

    ctx.font = `${22 / scale}px Arial`;
    ctx.fillText("Press [Space] to play again", canvas.width / 2, canvas.height - 50 / scale);
}

// --- Game Loop ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// --- Initialization ---
// Adjust player and object positions based on initial scale
player.y = 400 * scale; // Set initial player Y based on scale

// Initial setup before game starts
initRoom(); // Set up the first room's parameters
updateUI(); // Update UI elements initially
gameLoop(); // Start the game loop

