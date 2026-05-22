const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const roomDisplay = document.getElementById('room-num');
const targetLabel = document.getElementById('target-label');
const targetValDisplay = document.getElementById('target-val');
const hpDisplay = document.getElementById('hp');
const checklistDisplay = document.getElementById('checklist-items');
const scoreDisplay = document.getElementById('score');

const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
const factorChecklist = document.getElementById('factor-checklist');
const instructions = document.getElementById('instructions');
const startButton = document.getElementById('start-button');
const nameInputContainer = document.getElementById('name-input-container');
const playerNameInput = document.getElementById('player-name-input');
const submitScoreBtn = document.getElementById('submit-score-btn');
const gameContainer = document.getElementById('game-container');

// --- Google Sheets 配置 ---
// Alex, 請在建立好 Google Apps Script 後，將網址貼在這裡
const GOOGLE_SCRIPT_URL = "";

let scale = 1;
let virtualJoystick = { active: false, startX: 0, startY: 0, curX: 0, curY: 0 };

function resizeCanvas() {
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const aspectRatio = 800 / 500;

    let newWidth, newHeight;
    if (containerWidth / containerHeight > aspectRatio) {
        newHeight = containerHeight;
        newWidth = newHeight * aspectRatio;
    } else {
        newWidth = containerWidth;
        newHeight = newWidth / aspectRatio;
    }

    canvas.width = newWidth;
    canvas.height = newHeight;
    scale = Math.max(newWidth / 800, 0.1);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// 遊戲狀態
let gameState = 'MENU';
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
    x: 100,
    y: 250,
    width: 25,
    height: 40,
    speed: 6
};

const mouse = { x: 0, y: 0 };
let lastShot = { x: 0, y: 0, timer: 0 };
let gameObjects = [];
const keys = {};

const leaderboardKey = 'math_adventure_all_scores';

// --- 輸入處理 ---
window.addEventListener('keydown', e => {
    if (gameState === 'PLAYING' && gameActive && !isEntering && !isExiting) keys[e.code] = true;
    if ((gameState === 'WIN' || gameState === 'GAMEOVER' || gameState === 'LEADERBOARD') && e.code === 'Space') keys[e.code] = true;
});

window.addEventListener('keyup', e => {
    if (gameState === 'PLAYING' || gameState === 'WIN' || gameState === 'GAMEOVER' || gameState === 'LEADERBOARD') keys[e.code] = false;
});

canvas.addEventListener('mousemove', e => {
    if (gameState !== 'PLAYING' || !gameActive || isEntering || isExiting) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / scale;
    mouse.y = (e.clientY - rect.top) / scale;
});

canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (gameState !== 'PLAYING' || !gameActive || isEntering || isExiting) return;
    handleShot(mouse.x, mouse.y);
});

canvas.addEventListener('touchstart', e => {
    if (gameState !== 'PLAYING') return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const tx = (touch.clientX - rect.left) / scale;
    const ty = (touch.clientY - rect.top) / scale;

    if (tx < 400) {
        virtualJoystick.active = true;
        virtualJoystick.startX = touch.clientX;
        virtualJoystick.startY = touch.clientY;
        virtualJoystick.curX = touch.clientX;
        virtualJoystick.curY = touch.clientY;
    } else {
        handleShot(tx, ty);
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    if (virtualJoystick.active) {
        virtualJoystick.curX = e.touches[0].clientX;
        virtualJoystick.curY = e.touches[0].clientY;
    }
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => {
    virtualJoystick.active = false;
});

startButton.addEventListener('click', () => {
    if (gameState === 'MENU') startGame();
    else if (gameState === 'WIN' || gameState === 'GAMEOVER' || gameState === 'LEADERBOARD') resetGame();
});

submitScoreBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || "Anonymous";
    saveScore(name, score, cycleCount);
    nameInputContainer.style.display = 'none';
    gameState = 'LEADERBOARD'; // Update state to show leaderboard
    showLeaderboardScreen();
});

function startGame() {
    gameState = 'PLAYING';
    gameActive = true;
    startScreen.style.display = 'none';
    hud.style.display = 'flex';
    factorChecklist.style.display = 'block';
    instructions.style.display = 'block';
    roomCount = 1; cycleCount = 1; score = 0; hp = 3;
    startTime = Date.now();
    initRoom();
}

function saveScore(name, finalScore, level) {
    const records = JSON.parse(localStorage.getItem(leaderboardKey) || "[]");
    records.push({ name, score: finalScore, level, date: new Date().toLocaleString() });
    localStorage.setItem(leaderboardKey, JSON.stringify(records));

    if (GOOGLE_SCRIPT_URL) {
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, score: finalScore, level })
        }).then(() => console.log("Score sent to Google Sheets")).catch(e => console.error("Error sending score to Google Sheets:", e));
    }
}

function getLeaderboard() {
    return JSON.parse(localStorage.getItem(leaderboardKey) || "[]").sort((a,b) => b.score - a.score);
}

function initRoom() {
    isBossMode = (roomCount % 5 === 0);
    isEntering = true; isExiting = false;
    player.x = -50; player.y = canvas.height / 2; // Start off-screen left, centered vertically

    if (isBossMode) {
        targetNum = 2 + Math.floor(Math.random() * 8) + (cycleCount * 2);
        initBossMode();
    } else {
        targetNum = 10 + Math.floor(Math.random() * 20) + (cycleCount * 5);
        initNormalMode();
    }
    updateUI();
}

function initNormalMode() {
    factorsToFind = [];
    for (let i = 1; i <= targetNum; i++) if (targetNum % i === 0) factorsToFind.push(i);
    foundFactors = [];
    doorOpen = false;
    gameObjects = [];

    // Add factors to the screen
    factorsToFind.forEach(num => {
        gameObjects.push({
            x: 150 + Math.random() * 500,
            y: 50 + Math.random() * 400,
            width: 45, height: 45,
            number: num, isDistractor: false
        });
    });

    // Add distractors
    for (let i = 0; i < 5 + cycleCount; i++) {
        let n;
        do { n = Math.floor(Math.random() * 50) + 1; } while (targetNum % n === 0);
        gameObjects.push({
            x: 150 + Math.random() * 500,
            y: 50 + Math.random() * 400,
            width: 45, height: 45,
            number: n, isDistractor: true
        });
    }
}

function initBossMode() {
    bossHp = 100;
    gameObjects = [];
    for (let i = 0; i < 10 + cycleCount * 2; i++) { // More objects in boss mode
        let isM = Math.random() > 0.4; // Higher chance for multiples
        let n = isM ? targetNum * (Math.floor(Math.random() * 6) + 1) : Math.floor(Math.random() * 70) + 1;
        gameObjects.push({
            x: 150 + Math.random() * 400,
            y: 50 + Math.random() * 400,
            width: 50, height: 50,
            number: n, isDistractor: !(n % targetNum === 0)
        });
    }
}

function handleShot(sx, sy) {
    if (!gameActive) return;
    lastShot = { x: sx, y: sy, timer: 15 }; // Longer trail visibility

    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];
        if (sx >= obj.x && sx <= obj.x + obj.width && sy >= obj.y && sy <= obj.y + obj.height) {
            if (!obj.isDistractor) {
                score += 20;
                if (isBossMode) {
                    bossHp -= 25; bossShake = 15;
                    if (bossHp <= 0) { isExiting = true; gameObjects = []; }
                } else {
                    if (!foundFactors.includes(obj.number)) {
                        foundFactors.push(obj.number);
                        // Condition to open door: collected at least 3 factors OR all available factors if less than 3
                        if (foundFactors.length >= Math.min(factorsToFind.length, 3)) {
                            doorOpen = true;
                            isExiting = true;
                            gameObjects = [];
                        }
                    }
                }
            } else {
                hp--;
                if (hp <= 0) endGame();
            }
            if (!isBossMode) gameObjects.splice(i, 1);
            scoreDisplay.innerText = score;
            updateUI(); // Refresh UI elements
            break;
        }
    }
}

function updateUI() {
    roomDisplay.innerText = isBossMode ? `BOSS (Cycle ${cycleCount})` : `Room ${roomCount} (Cycle ${cycleCount})`;
    targetValDisplay.innerText = targetNum;
    updateHP();
    updateChecklist();
}

function updateHP() { hpDisplay.innerText = "❤".repeat(hp); }
function updateChecklist() {
    if (isBossMode) checklistDisplay.innerText = `Boss HP: ${Math.max(0, bossHp)}%`;
    else checklistDisplay.innerText = `Factors found: ${foundFactors.length}/${factorsToFind.length}`;
}

function endGame() {
    gameActive = false;
    gameState = 'GAMEOVER';
    nameInputContainer.style.display = 'block';
}

function winGame() {
    gameActive = false;
    gameState = 'WIN';
    nameInputContainer.style.display = 'block';
}

function resetGame() {
    gameState = 'MENU';
    startScreen.style.display = 'flex';
    hud.style.display = 'none';
    factorChecklist.style.display = 'none';
    instructions.style.display = 'none';
    nameInputContainer.style.display = 'none'; // Hide input on reset
    player.x = 100; player.y = canvas.height / 2; // Reset player position for new game
    score = 0;
    hp = 3;
    roomCount = 1;
    cycleCount = 1;
    startTime = Date.now();
    initRoom(); // Re-initialize for a new game
    updateUI();
}

function update() {
    if (gameState !== 'PLAYING') {
        if ((gameState === 'WIN' || gameState === 'GAMEOVER' || gameState === 'LEADERBOARD') && keys['Space']) {
            resetGame();
        }
        return;
    }

    elapsedTime = Date.now() - startTime;

    if (lastShot.timer > 0) lastShot.timer--;
    if (bossShake > 0) bossShake--;

    // Player Movement (Keyboard)
    let moveX = 0, moveY = 0;
    if (keys['ArrowLeft']) moveX = -1;
    if (keys['ArrowRight']) moveX = 1;
    if (keys['ArrowUp']) moveY = -1;
    if (keys['ArrowDown']) moveY = 1;

    // Player Movement (Touch - Virtual Joystick)
    if (virtualJoystick.active) {
        const dx = virtualJoystick.curX - virtualJoystick.startX;
        const dy = virtualJoystick.curY - virtualJoystick.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 75) { // Normalize movement if joystick moved far enough
            moveX = dx / distance;
            moveY = dy / distance;
        } else {
            moveX = dx / 50;
            moveY = dy / 50;
        }
        moveX = Math.max(-1, Math.min(1, moveX));
        moveY = Math.max(-1, Math.min(1, moveY));
    }

    player.x += moveX * player.speed;
    player.y += moveY * player.speed;

    // Boundary Checks for Player
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
    player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));

    // Screen Transition Logic
    if (isEntering) {
        player.x += 4;
        if (player.x >= 100) isEntering = false;
    } else if (isExiting) {
        player.x += 6; // Move player towards the exit
        // Smoothly move player towards center of the exit door if needed
        const exitY = canvas.height / 2 - 25; // Adjust based on door's visual center
        player.y += (exitY - player.y) * 0.1;

        if (player.x > canvas.width) { // Transition to next room/level
            if (isBossMode) {
                cycleCount++;
            }
            roomCount++;
            // Check for win condition (e.g., after X rooms or Y cycles)
            if (roomCount > 10 && !isBossMode) { // Example: win after 10 normal rooms
                winGame();
            } else {
                initRoom(); // Setup next room
            }
        }
    }
}

function drawWarrior(x, y) {
    ctx.fillStyle = '#0f380f'; // Darkest green
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

    ctx.fillStyle = '#0f380f';
    ctx.beginPath();
    ctx.moveTo(bx, by + 50 * scale); ctx.lineTo(bx + 60 * scale, by); ctx.lineTo(bx + 120 * scale, by + 50 * scale);
    ctx.lineTo(bx + 120 * scale, by + 150 * scale); ctx.lineTo(bx, by + 150 * scale);
    ctx.fill();

    ctx.fillRect(bx + 10 * scale, by - 20 * scale, 15 * scale, 30 * scale);
    ctx.fillRect(bx + 95 * scale, by - 20 * scale, 15 * scale, 30 * scale);

    ctx.fillStyle = bossHp < 50 ? "red" : '#9bbc0f';
    ctx.beginPath(); ctx.arc(bx + 60 * scale, by + 70 * scale, 25 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f380f';
    ctx.beginPath(); ctx.arc(bx + 60 * scale, by + 70 * scale, 10 * scale, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#306230';
    ctx.fillRect(canvas.width - 200 * scale, 50 * scale, 150 * scale, 20 * scale);
    ctx.fillStyle = 'red';
    ctx.fillRect(canvas.width - 200 * scale, 50 * scale, (bossHp / 100) * 150 * scale, 20 * scale);
}

function draw() {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, 800, 500);

    if (gameState === 'PLAYING') {
        if (doorOpen || isExiting) {
            ctx.fillStyle = '#0f380f';
            ctx.fillRect(760, canvas.height / 2 - 50, 40, 100);
        }

        drawWarrior(player.x, player.y);

        gameObjects.forEach(obj => {
            ctx.fillStyle = obj.isDistractor ? '#d40000' : '#0f380f';
            ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
            ctx.fillStyle = '#9bbc0f';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(obj.number, obj.x + obj.width/2, obj.y + obj.height/2 + 7);
        });

        if (lastShot.timer > 0) {
            ctx.strokeStyle = '#0f380f';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(player.x + player.width/2, player.y + player.height/2);
            ctx.lineTo(lastShot.x, lastShot.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (isBossMode && bossHp > 0) drawBoss();

        // Virtual Joystick Visualisation
        if (virtualJoystick.active) {
            ctx.strokeStyle = 'rgba(15, 56, 15, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(virtualJoystick.startX - canvas.getBoundingClientRect().left, virtualJoystick.startY - canvas.getBoundingClientRect().top, 50, 0, Math.PI*2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(15, 56, 15, 0.5)';
            ctx.beginPath();
            ctx.arc(virtualJoystick.curX - canvas.getBoundingClientRect().left, virtualJoystick.curY - canvas.getBoundingClientRect().top, 25, 0, Math.PI*2);
            ctx.fill();
        }
    } else if (gameState === 'GAMEOVER') {
        drawGameOverScreen();
    } else if (gameState === 'WIN') {
        drawWinScreen();
    } else if (gameState === 'LEADERBOARD') {
        drawLeaderboardScreen();
    }

    ctx.restore();
}

function drawGameOverScreen() {
    ctx.fillStyle = "rgba(15, 56, 15, 0.9)";
    ctx.fillRect(0, 0, 800, 500);

    ctx.fillStyle = '#d40000';
    ctx.textAlign = 'center';
    ctx.font = `bold ${40/scale}px Arial`;
    ctx.fillText("WARRIOR FALLEN", 400, 90);

    ctx.fillStyle = '#9bbc0f';
    ctx.font = `${26/scale}px Arial`;
    ctx.fillText(`Final Score: ${score}`, 400, 150);
    ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s | Cycle: ${cycleCount}`, 400, 190);

    ctx.font = `${22/scale}px Arial`;
    const lb = getLeaderboard().slice(0, 8);
    if (lb.length === 0) {
        ctx.fillText("No records yet!", 400, 240);
    } else {
        lb.forEach((r, i) => {
            ctx.fillText(`${i+1}. ${r.name}: ${r.score}`, 400, 240 + i*25);
        });
    }

    ctx.font = `${22/scale}px Arial`;
    ctx.fillText("Press [Space] to play again", 400, 500 - 50);
}

function drawWinScreen() {
    ctx.fillStyle = "rgba(15, 56, 15, 0.9)";
    ctx.fillRect(0, 0, 800, 500);

    ctx.fillStyle = '#9bbc0f';
    ctx.textAlign = 'center';
    ctx.font = `bold ${40/scale}px Arial`;
    ctx.fillText("MISSION ACCOMPLISHED!", 400, 90);

    ctx.font = `${26/scale}px Arial`;
    ctx.fillText(`Final Score: ${score}`, 400, 150);
    ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s | Final Cycle: ${cycleCount}`, 400, 190);

    ctx.font = `${22/scale}px Arial`;
    ctx.fillText("Press [Space] to play again", 400, 500 - 50);
}

function drawLeaderboardScreen() {
    ctx.fillStyle = "rgba(15, 56, 15, 0.9)";
    ctx.fillRect(0, 0, 800, 500);

    ctx.fillStyle = '#9bbc0f';
    ctx.textAlign = 'center';
    ctx.font = `bold ${40/scale}px Arial`;
    ctx.fillText("HIGH SCORES", 400, 90);

    const lb = getLeaderboard();
    if (lb.length === 0) {
        ctx.font = `${20/scale}px Arial`;
        ctx.fillText("No records yet!", 400, 150);
    } else {
        lb.forEach((entry, i) => {
            ctx.font = `${20/scale}px Arial`;
            ctx.fillText(`#${i+1} - ${entry.name}: ${entry.score} (Lvl ${entry.level})`, 400, 150 + (i * 30));
        });
    }

    ctx.font = `${22/scale}px Arial`;
    ctx.fillText("Press [Space] to play again", 400, 500 - 50);
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Initialize game state
initRoom();
updateUI();
gameLoop();
