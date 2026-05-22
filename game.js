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
    scale = Math.max(newWidth / 800, 0.1); // 確保 scale 不為 0
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

// 觸控移動 (虛擬搖桿)
canvas.addEventListener('touchstart', e => {
    if (gameState !== 'PLAYING') return;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const tx = (touch.clientX - rect.left) / scale;
    const ty = (touch.clientY - rect.top) / scale;

    // 如果點擊左半邊，當作移動
    if (tx < 400) {
        virtualJoystick.active = true;
        virtualJoystick.startX = touch.clientX;
        virtualJoystick.startY = touch.clientY;
        virtualJoystick.curX = touch.clientX;
        virtualJoystick.curY = touch.clientY;
    } else {
        // 點擊右半邊，當作射擊
        handleShot(tx, ty);
    }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    if (virtualJoystick.active) {
        const touch = e.touches[0];
        virtualJoystick.curX = touch.clientX;
        virtualJoystick.curY = touch.clientY;
    }
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => {
    virtualJoystick.active = false;
});

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
    // 1. 存入 LocalStorage (本地備份)
    const records = JSON.parse(localStorage.getItem(leaderboardKey) || "[]");
    records.push({ name, score: finalScore, level, date: new Date().toLocaleString() });
    localStorage.setItem(leaderboardKey, JSON.stringify(records));

    // 2. 傳送到 Google Sheets (如果有 URL)
    if (GOOGLE_SCRIPT_URL) {
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // 重要：避免跨網域問題
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, score: finalScore, level })
        }).then(() => console.log("Score sent to Google Sheets")).catch(e => console.error(e));
    }
}

function getLeaderboard() {
    return JSON.parse(localStorage.getItem(leaderboardKey) || "[]").sort((a,b) => b.score - a.score);
}

function initRoom() {
    isBossMode = (roomCount % 5 === 0);
    isEntering = true; isExiting = false;
    player.x = -50; player.y = 250;

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

    factorsToFind.forEach(num => {
        gameObjects.push({
            x: 150 + Math.random() * 500,
            y: 50 + Math.random() * 400,
            width: 45, height: 45,
            number: num, isDistractor: false
        });
    });

    for (let i = 0; i < 5; i++) {
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
    for (let i = 0; i < 8; i++) {
        let isM = Math.random() > 0.5;
        let n = isM ? targetNum * (Math.floor(Math.random() * 5) + 1) : Math.floor(Math.random() * 50) + 1;
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
    lastShot = { x: sx, y: sy, timer: 10 };

    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];
        if (sx >= obj.x && sx <= obj.x + obj.width && sy >= obj.y && sy <= obj.y + obj.height) {
            if (!obj.isDistractor) {
                score += 20;
                if (isBossMode) {
                    bossHp -= 25; bossShake = 10;
                    if (bossHp <= 0) { isExiting = true; gameObjects = []; }
                } else {
                    if (!foundFactors.includes(obj.number)) {
                        foundFactors.push(obj.number);
                        if (foundFactors.length >= Math.min(factorsToFind.length, 3)) { doorOpen = true; isExiting = true; gameObjects = []; }
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
}

function update() {
    if (gameState !== 'PLAYING') return;
    elapsedTime = Date.now() - startTime;
    if (lastShot.timer > 0) lastShot.timer--;
    if (bossShake > 0) bossShake--;

    // 移動處理 (鍵盤)
    let moveX = 0, moveY = 0;
    if (keys['ArrowLeft']) moveX = -1;
    if (keys['ArrowRight']) moveX = 1;
    if (keys['ArrowUp']) moveY = -1;
    if (keys['ArrowDown']) moveY = 1;

    // 移動處理 (觸控)
    if (virtualJoystick.active) {
        moveX = (virtualJoystick.curX - virtualJoystick.startX) / 50;
        moveY = (virtualJoystick.curY - virtualJoystick.startY) / 50;
        // 限制最大速度
        moveX = Math.max(-1, Math.min(1, moveX));
        moveY = Math.max(-1, Math.min(1, moveY));
    }

    player.x += moveX * player.speed;
    player.y += moveY * player.speed;

    // 邊界限制
    player.x = Math.max(0, Math.min(800 - player.width, player.x));
    player.y = Math.max(0, Math.min(500 - player.height, player.y));

    if (isEntering) { player.x += 4; if (player.x >= 100) isEntering = false; }
    if (isExiting) {
        player.x += 6;
        if (player.x > 800) {
            roomCount++;
            if (isBossMode) cycleCount++;
            initRoom();
        }
    }
}

function draw() {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, 800, 500);

    if (gameState === 'PLAYING') {
        // 畫門
        if (doorOpen || isExiting) {
            ctx.fillStyle = '#0f380f';
            ctx.fillRect(760, 200, 40, 100);
        }

        // 畫玩家
        ctx.fillStyle = '#0f380f';
        ctx.fillRect(player.x, player.y, player.width, player.height);

        // 畫物件
        gameObjects.forEach(obj => {
            ctx.fillStyle = '#0f380f';
            ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
            ctx.fillStyle = '#9bbc0f';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(obj.number, obj.x + obj.width/2, obj.y + obj.height/2 + 7);
        });

        // 畫射擊線
        if (lastShot.timer > 0) {
            ctx.strokeStyle = '#0f380f';
            ctx.beginPath();
            ctx.moveTo(player.x + player.width/2, player.y + player.height/2);
            ctx.lineTo(lastShot.x, lastShot.y);
            ctx.stroke();
        }

        // 畫搖桿提示 (手機)
        if (virtualJoystick.active) {
            ctx.strokeStyle = 'rgba(15, 56, 15, 0.3)';
            ctx.beginPath();
            ctx.arc((virtualJoystick.startX - canvas.getBoundingClientRect().left)/scale, (virtualJoystick.startY - canvas.getBoundingClientRect().top)/scale, 50, 0, Math.PI*2);
            ctx.stroke();
        }
    } else if (gameState === 'GAMEOVER') {
        ctx.fillStyle = '#0f380f';
        ctx.textAlign = 'center';
        ctx.font = '40px Arial';
        ctx.fillText('GAME OVER', 400, 150);
        ctx.font = '20px Arial';
        const lb = getLeaderboard().slice(0, 8); // 畫面上顯示前 8 名
        lb.forEach((r, i) => {
            ctx.fillText(`${i+1}. ${r.name}: ${r.score}`, 400, 200 + i*25);
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
