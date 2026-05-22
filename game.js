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

// --- 配置 ---
const GOOGLE_SCRIPT_URL = "";
const VIRTUAL_WIDTH = 800;
const VIRTUAL_HEIGHT = 500;
let scale = 1;

function resizeCanvas() {
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    const aspectRatio = VIRTUAL_WIDTH / VIRTUAL_HEIGHT;

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
    scale = Math.max(newWidth / VIRTUAL_WIDTH, 0.1);
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
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// 簡單觸控處理：點擊即射擊
canvas.addEventListener('touchstart', e => {
    if (gameState !== 'PLAYING') return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const tx = (touch.clientX - rect.left) / scale;
    const ty = (touch.clientY - rect.top) / scale;
    handleShot(tx, ty);
}, { passive: false });

canvas.addEventListener('mousedown', e => {
    if (gameState !== 'PLAYING') return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / scale;
    const my = (e.clientY - rect.top) / scale;
    handleShot(mx, my);
});

startButton.addEventListener('click', startGame);

submitScoreBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || "Anonymous";
    saveScore(name, score, cycleCount);
    nameInputContainer.style.display = 'none';
    resetGame();
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
        }).catch(e => console.error(e));
    }
}

function getLeaderboard() {
    return JSON.parse(localStorage.getItem(leaderboardKey) || "[]").sort((a,b) => b.score - a.score);
}

function checkOverlap(x, y, others) {
    for (let obj of others) {
        const d = Math.sqrt((x - obj.x)**2 + (y - obj.y)**2);
        if (d < 80) return true;
    }
    return false;
}

function initRoom() {
    isBossMode = (roomCount % 5 === 0);
    isEntering = true; isExiting = false;
    player.x = -50; player.y = 250;
    doorOpen = false;
    foundFactors = [];
    gameObjects = [];

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

    // 放置目標數字
    factorsToFind.forEach(num => {
        let posX, posY, attempts = 0;
        do {
            posX = 150 + Math.random() * 500;
            posY = 80 + Math.random() * 340;
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 50);
        gameObjects.push({ x: posX, y: posY, width: 45, height: 45, number: num, isDistractor: false });
    });

    // 放置干擾數字
    for (let i = 0; i < 6; i++) {
        let n, posX, posY, attempts = 0;
        do { n = Math.floor(Math.random() * 60) + 1; } while (targetNum % n === 0);
        do {
            posX = 150 + Math.random() * 500;
            posY = 80 + Math.random() * 340;
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 50);
        gameObjects.push({ x: posX, y: posY, width: 45, height: 45, number: n, isDistractor: true });
    }
}

function initBossMode() {
    bossHp = 100;
    for (let i = 0; i < 10; i++) {
        let isM = Math.random() > 0.4;
        let n = isM ? targetNum * (Math.floor(Math.random() * 6) + 1) : Math.floor(Math.random() * 70) + 1;
        let posX, posY, attempts = 0;
        do {
            posX = 150 + Math.random() * 400;
            posY = 80 + Math.random() * 340;
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 50);
        gameObjects.push({ x: posX, y: posY, width: 50, height: 50, number: n, isDistractor: !(n % targetNum === 0) });
    }
}

function handleShot(sx, sy) {
    if (!gameActive || isEntering || isExiting) return;
    lastShot = { x: sx, y: sy, timer: 10 };

    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];
        if (sx >= obj.x && sx <= obj.x + obj.width && sy >= obj.y && sy <= obj.y + obj.height) {
            if (!obj.isDistractor) {
                score += 20;
                if (isBossMode) {
                    bossHp -= 25; bossShake = 10;
                    if (bossHp <= 0) { isExiting = true; doorOpen = true; gameObjects = []; }
                } else {
                    if (!foundFactors.includes(obj.number)) {
                        foundFactors.push(obj.number);
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
            updateChecklist();
            break;
        }
    }
}

function updateUI() {
    roomDisplay.innerText = roomCount;
    targetLabel.innerText = isBossMode ? "Multiple of:" : "Factor of:";
    targetValDisplay.innerText = targetNum;
    updateHP();
    updateChecklist();
}

function updateHP() { hpDisplay.innerText = "❤".repeat(hp); }
function updateChecklist() {
    if (isBossMode) checklistDisplay.innerText = `Boss HP: ${bossHp}%`;
    else checklistDisplay.innerText = `Found: ${foundFactors.length}/${Math.min(factorsToFind.length, 3)}`;
}

function endGame() {
    gameActive = false;
    gameState = 'GAMEOVER';
    nameInputContainer.style.display = 'block';
}

function resetGame() {
    gameState = 'MENU';
    startScreen.style.display = 'flex';
    hud.style.display = 'none';
    factorChecklist.style.display = 'none';
    instructions.style.display = 'none';
    nameInputContainer.style.display = 'none';
    player.x = 100; player.y = 250;
    score = 0;
    hp = 3;
    roomCount = 1;
    cycleCount = 1;
    startTime = Date.now();
    initRoom();
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

    let moveX = 0, moveY = 0;
    if (keys['ArrowLeft']) moveX = -1;
    if (keys['ArrowRight']) moveX = 1;
    if (keys['ArrowUp']) moveY = -1;
    if (keys['ArrowDown']) moveY = 1;

    player.x += moveX * player.speed;
    player.y += moveY * player.speed;

    // 邊界限制：只有在非過場狀態才限制右邊界
    player.x = Math.max(-60, player.x);
    if (!isExiting) {
        player.x = Math.min(VIRTUAL_WIDTH - player.width, player.x);
    }
    player.y = Math.max(0, Math.min(VIRTUAL_HEIGHT - player.height, player.y));

    if (isEntering) { player.x += 4; if (player.x >= 100) isEntering = false; }
    if (isExiting) {
        player.x += 6;
        if (player.x > VIRTUAL_WIDTH) {
            roomCount++;
            if (isBossMode) cycleCount++;
            initRoom();
        }
    }
}

function draw() {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    if (gameState === 'PLAYING') {
        if (doorOpen || isExiting) {
            ctx.fillStyle = '#0f380f';
            ctx.fillRect(VIRTUAL_WIDTH - 40, VIRTUAL_HEIGHT/2 - 50, 40, 100);
        }

        // 畫玩家
        ctx.fillStyle = '#0f380f';
        ctx.fillRect(player.x, player.y, player.width, player.height);

        // 畫數字 (統一顏色)
        gameObjects.forEach(obj => {
            ctx.fillStyle = '#0f380f';
            ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
            ctx.fillStyle = '#9bbc0f';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(obj.number, obj.x + obj.width/2, obj.y + obj.height/2 + 7);
        });

        if (lastShot.timer > 0) {
            ctx.strokeStyle = '#0f380f';
            ctx.beginPath();
            ctx.moveTo(player.x + player.width/2, player.y + player.height/2);
            ctx.lineTo(lastShot.x, lastShot.y);
            ctx.stroke();
        }
    } else if (gameState === 'GAMEOVER') {
        ctx.fillStyle = '#0f380f';
        ctx.textAlign = 'center';
        ctx.font = '40px Arial';
        ctx.fillText('GAME OVER', VIRTUAL_WIDTH/2, 120);
        ctx.font = '20px Arial';
        const lb = getLeaderboard().slice(0, 10);
        lb.forEach((r, i) => {
            ctx.fillText(`${i+1}. ${r.name}: ${r.score}`, VIRTUAL_WIDTH/2, 170 + i*25);
        });
    }

    ctx.restore();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
