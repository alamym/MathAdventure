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
let cycleCount = 1; // 每一輪 (4+1)
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
    // 每 5 關一個 Boss (1,2,3,4 關 factor, 第 5 關 Boss)
    isBossMode = (roomCount % 5 === 0);
    isEntering = true; isExiting = false;
    player.x = -50; player.y = 250;
    doorOpen = false;
    foundFactors = [];
    gameObjects = [];

    if (isBossMode) {
        initBossMode();
    } else {
        initNormalMode();
    }
    updateUI();
}

function initNormalMode() {
    // 難度遞增邏輯
    if (cycleCount === 1) {
        // 第一輪：熱身，選因子數少的數字 (質數或簡單數字)
        const warmUpTargets = [6, 8, 10, 13, 14, 15, 17, 19, 21, 22];
        targetNum = warmUpTargets[Math.floor(Math.random() * warmUpTargets.length)];
    } else {
        // 第二輪之後：難度增加，數字變大且因子變多
        targetNum = 24 + Math.floor(Math.random() * 30) + (cycleCount * 10);
    }

    factorsToFind = [];
    for (let i = 1; i <= targetNum; i++) if (targetNum % i === 0) factorsToFind.push(i);

    // 放置目標數字 (不重複)
    const roomNumbers = new Set();
    factorsToFind.forEach(num => {
        let posX, posY, attempts = 0;
        do {
            posX = 150 + Math.random() * 550;
            posY = 80 + Math.random() * 340;
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 100);
        gameObjects.push({ x: posX, y: posY, width: 45, height: 45, number: num, isDistractor: false });
        roomNumbers.add(num);
    });

    // 放置干擾數字 (不重複)
    let distractorsCount = 5 + cycleCount;
    for (let i = 0; i < distractorsCount; i++) {
        let n, posX, posY, attempts = 0;
        do {
            n = Math.floor(Math.random() * (targetNum + 20)) + 1;
        } while (targetNum % n === 0 || roomNumbers.has(n));

        do {
            posX = 150 + Math.random() * 550;
            posY = 80 + Math.random() * 340;
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 100);

        gameObjects.push({ x: posX, y: posY, width: 45, height: 45, number: n, isDistractor: true });
        roomNumbers.add(n);
    }
}

function initBossMode() {
    bossHp = 100;
    // Boss 難度遞增
    if (cycleCount === 1) {
        targetNum = 2 + Math.floor(Math.random() * 8); // Round 1: 2-9
    } else {
        targetNum = 10 + Math.floor(Math.random() * 6); // Round 2+: 10-15
    }

    const roomNumbers = new Set();
    // Boss 關卡目標：倍數
    for (let i = 0; i < 10; i++) {
        let isM = Math.random() > 0.4;
        let n;
        if (isM) {
            n = targetNum * (Math.floor(Math.random() * 6) + 1);
        } else {
            do { n = Math.floor(Math.random() * 100) + 1; } while (n % targetNum === 0 || roomNumbers.has(n));
        }

        let posX, posY, attempts = 0;
        do {
            posX = 150 + Math.random() * 400;
            posY = 80 + Math.random() * 340;
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 100);

        gameObjects.push({
            x: posX, y: posY, width: 50, height: 50,
            number: n,
            isDistractor: !(n % targetNum === 0)
        });
        roomNumbers.add(n);
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
                    bossHp -= 25; bossShake = 15;
                    if (bossHp <= 0) {
                        score += 500;
                        isExiting = true;
                        doorOpen = true;
                        gameObjects = [];
                    }
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
    score = 0; hp = 3; roomCount = 1; cycleCount = 1;
    startTime = Date.now();
    initRoom();
}

function update() {
    if (gameState !== 'PLAYING') return;
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

    player.x = Math.max(0, player.x);
    if (!isExiting) player.x = Math.min(VIRTUAL_WIDTH - player.width, player.x);
    player.y = Math.max(0, Math.min(VIRTUAL_HEIGHT - player.height, player.y));

    if (isEntering) { player.x += 4; if (player.x >= 100) isEntering = false; }
    if (isExiting) {
        player.x += 6;
        if (player.x > VIRTUAL_WIDTH) {
            if (isBossMode) cycleCount++;
            roomCount++;
            initRoom();
        }
    }
}

function drawWarrior(x, y) {
    ctx.fillStyle = '#0f380f';
    ctx.fillRect(x + 6, y, 12, 12);
    ctx.fillRect(x + 2, y + 12, 21, 18);
    ctx.fillRect(x, y + 15, 4, 15);
    ctx.fillRect(x + 21, y + 15, 4, 15);
    ctx.fillRect(x + 4, y + 30, 6, 10);
    ctx.fillRect(x + 15, y + 30, 6, 10);
    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(x + 8, y + 4, 3, 3);
    ctx.fillRect(x + 14, y + 4, 3, 3);
}

function drawBoss() {
    const bx = (VIRTUAL_WIDTH - 180) + (Math.random() * bossShake);
    const by = 100 + (Math.random() * bossShake);
    ctx.fillStyle = '#0f380f';
    ctx.beginPath();
    ctx.moveTo(bx, by + 50); ctx.lineTo(bx + 60, by); ctx.lineTo(bx + 120, by + 50);
    ctx.lineTo(bx + 120, by + 150); ctx.lineTo(bx, by + 150);
    ctx.fill();
    ctx.fillRect(bx + 10, by - 20, 15, 30);
    ctx.fillRect(bx + 95, by - 20, 15, 30);
    ctx.fillStyle = '#9bbc0f';
    ctx.beginPath(); ctx.arc(bx + 60, by + 70, 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f380f';
    ctx.beginPath(); ctx.arc(bx + 60, by + 70, 10, 0, Math.PI * 2); ctx.fill();
    // Health Bar
    ctx.fillStyle = '#0f380f';
    ctx.fillRect(VIRTUAL_WIDTH - 200, 50, 150, 20);
    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(VIRTUAL_WIDTH - 200, 50, (bossHp / 100) * 150, 20);
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
        drawWarrior(player.x, player.y);
        if (isBossMode && bossHp > 0) drawBoss();
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
