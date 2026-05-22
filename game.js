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

canvas.width = 800;
canvas.height = 500;

const COLORS = {
    darkest: '#0f380f',
    dark: '#306230',
    mid: '#8bac0f',
    light: '#9bbc0f',
    bad: '#d40000'
};

// 遊戲狀態
let gameState = 'MENU';
let roomCount = 1;
let cycleCount = 1; // 新增：追蹤目前是第幾輪 (4+1)
let score = 0;
let hp = 3;
let targetNum = 0;
let factorsToFind = [];
let foundFactors = [];
let gameActive = true;
let doorOpen = false;

let startTime = 0; // 新增：計時器
let elapsedTime = 0;

let isEntering = false;
let isExiting = false;
let isBossMode = false;
let bossHp = 100;
let bossShake = 0;

const player = {
    x: -50,
    y: 400,
    width: 25,
    height: 40,
    color: COLORS.darkest,
    speed: 6
};

const mouse = { x: 0, y: 0 };
let lastShot = { x: 0, y: 0, timer: 0 };

let gameObjects = [];
let bossMultiplesPool = [];
const keys = {};

const leaderboardKey = 'math_adventure_scores'; // LocalStorage key

function getLeaderboard() {
    const data = localStorage.getItem(leaderboardKey);
    return data ? JSON.parse(data) : [];
}

function saveToLeaderboard(newScore, time, level) {
    const lb = getLeaderboard();
    lb.push({ score: newScore, time: time, level: level, date: new Date().toLocaleDateString() });
    lb.sort((a, b) => b.score - a.score);
    localStorage.setItem(leaderboardKey, JSON.stringify(lb.slice(0, 5))); // 只存前 5 名
}

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', e => {
    if (gameState !== 'PLAYING' || !gameActive || isEntering || isExiting) return;
    handleShot(mouse.x, mouse.y);
});

startButton.addEventListener('click', () => {
    startGame();
});

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

function getFactors(n) {
    const f = [];
    for (let i = 1; i <= n; i++) if (n % i === 0) f.push(i);
    return f;
}

function checkOverlap(x, y, others) {
    for (let obj of others) {
        const d = Math.sqrt((x-obj.x)**2 + (y-obj.y)**2);
        if (d < 75) return true;
    }
    return false;
}

function initRoom() {
    // 每 5 關一個 Boss (1,2,3,4 關 factor, 第 5 關 Boss)
    isBossMode = (roomCount % 5 === 0);
    isEntering = true;
    isExiting = false;
    player.x = -50;
    player.y = 400;

    if (isBossMode) {
        targetLabel.innerText = "Multiple of: ";
        initBossMode();
    } else {
        targetLabel.innerText = "Factor of target: ";
        initNormalMode();
    }
}

function initNormalMode() {
    let maxNum = 20 + (cycleCount * 10);
    targetNum = Math.floor(Math.random() * (maxNum - 10)) + 10;

    let allFactors = getFactors(targetNum);

    // 根據 Cycle 決定因子數量
    // Cycle 1: 2-6 個因子
    // Cycle 2+: 6-8 個因子
    let minF = cycleCount === 1 ? 2 : 6;
    let maxF = cycleCount === 1 ? 6 : 8;

    // 如果總因子數不夠，就全拿，否則隨機挑選
    if (allFactors.length <= minF) {
        factorsToFind = allFactors;
    } else {
        const count = Math.min(allFactors.length, Math.floor(Math.random() * (maxF - minF + 1)) + minF);
        factorsToFind = [];
        const shuffled = [...allFactors].sort(() => 0.5 - Math.random());
        for(let i=0; i<count; i++) factorsToFind.push(shuffled[i]);
    }

    foundFactors = [];
    doorOpen = false;
    gameObjects = [];

    const numbersForThisRoom = new Set();
    factorsToFind.forEach(f => numbersForThisRoom.add(f));

    const initialDistractorCount = 6 + cycleCount;
    let attempts = 0;

    while (numbersForThisRoom.size < factorsToFind.length + initialDistractorCount && attempts < 200) {
        let n = Math.floor(Math.random() * maxNum) + 1;
        if (!factorsToFind.includes(n) && !numbersForThisRoom.has(n)) {
            numbersForThisRoom.add(n);
        }
        attempts++;
    }

    Array.from(numbersForThisRoom).forEach(num => {
        let posX, posY;
        attempts = 0;
        do {
            posX = Math.random() * (canvas.width - 250) + 100;
            posY = Math.random() * (canvas.height - 150) + 50;
            attempts++;
        } while (checkOverlap(posX, posY, gameObjects) && attempts < 100);
        gameObjects.push({ x: posX, y: posY, width: 40, height: 40, number: num, isDistractor: !factorsToFind.includes(num) });
    });

    roomDisplay.innerText = `Room ${roomCount} (Cycle ${cycleCount})`;
    targetValDisplay.innerText = targetNum;
    updateChecklist();
    updateHP();
}

function initBossMode() {
    bossHp = 100;
    // Boss 倍數隨 Cycle 增加
    // Cycle 1: 2-9
    // Cycle 2: 11-19
    // Cycle 3+: 21-29...
    let baseOffset = (cycleCount - 1) * 10;
    targetNum = (baseOffset === 0 ? 2 : baseOffset + 1) + Math.floor(Math.random() * 8);

    gameObjects = [];
    bossMultiplesPool = [];

    roomDisplay.innerText = `BOSS!! Cycle ${cycleCount}`;
    targetValDisplay.innerText = targetNum;
    checklistDisplay.innerHTML = `<b style="color:#0f380f">HIT MULTIPLES OF ${targetNum}!</b>`;
    updateHP();

    const objectPoolSize = 10 + (cycleCount * 2); // 隨等級增加物件數量
    const maxMultiplier = 12;

    for (let i = 0; i < objectPoolSize; i++) {
        let num;
        let isDistractor;

        if (Math.random() > 0.4) {
            let multiplier = Math.floor(Math.random() * maxMultiplier) + 1;
            num = targetNum * multiplier;
            isDistractor = false;
        } else {
            do {
                num = Math.floor(Math.random() * (targetNum * maxMultiplier)) + 2;
            } while (num % targetNum === 0);
            isDistractor = true;
        }

        let posX, posY, attempts = 0;
        let isUniquePlacement = false;
        do {
            posX = Math.random() * (canvas.width - 300) + 100;
            posY = Math.random() * (canvas.height - 150) + 50;
            if (!checkOverlap(posX, posY, gameObjects)) {
                isUniquePlacement = true;
            }
            attempts++;
        } while (!isUniquePlacement && attempts < 100);

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
    lastShot = { x: sx, y: sy, timer: 10 };
    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];
        if (sx >= obj.x && sx <= obj.x + obj.width && sy >= obj.y && sy <= obj.y + obj.height) {
            if (!obj.isDistractor) {
                if (isBossMode) {
                    bossHp -= 20;
                    bossShake = 10;
                    score += 50;
                    if (bossHp <= 0) {
                        score += 500;
                        isExiting = true;
                        gameObjects = [];
                        return;
                    }
                    gameObjects.splice(i, 1);
                } else {
                    if (!foundFactors.includes(obj.number)) {
                        foundFactors.push(obj.number);
                        score += 20;
                        updateChecklist();
                        if (foundFactors.length === factorsToFind.length) {
                            doorOpen = true;
                            gameObjects = [];
                            isExiting = true;
                        }
                    }
                }
            } else {
                hp--;
                score = Math.max(0, score - 15);
                updateHP();
            }
            scoreDisplay.innerText = score;
            if (!isBossMode) gameObjects.splice(i, 1);
            break;
        }
    }
}

function updateChecklist() {
    const rem = factorsToFind.length - foundFactors.length;
    checklistDisplay.innerHTML = isBossMode ? `Boss HP: ${bossHp}%` : `Need ${rem} more factors`;
}

function updateHP() {
    hpDisplay.innerText = "❤".repeat(hp);
    if (hp <= 0) {
        gameActive = false;
        gameState = 'GAMEOVER';
        saveToLeaderboard(score, Math.floor(elapsedTime / 1000), cycleCount);
    }
}

function resetGame() {
    gameState = 'MENU';
    gameActive = true;
    startScreen.style.display = 'flex';
    hud.style.display = 'none';
    factorChecklist.style.display = 'none';
    instructions.style.display = 'none';
    hp = 3; score = 0; roomCount = 1; cycleCount = 1;
}

function update() {
    if (gameState !== 'PLAYING' || !gameActive) {
        if ((gameState === 'WIN' || gameState === 'GAMEOVER') && keys['Space']) {
            resetGame();
        }
        return;
    }

    elapsedTime = Date.now() - startTime;

    if (lastShot.timer > 0) lastShot.timer--;
    if (bossShake > 0) bossShake--;

    if (isEntering) {
        player.x += 4;
        if (player.x >= 100) isEntering = false;
        return;
    }

    if (isExiting) {
        player.x += 5;
        if (player.y < canvas.height/2 - 20) player.y += 3;
        if (player.y > canvas.height/2 - 20) player.y -= 3;
        if (player.x > canvas.width) {
            if (isBossMode) {
                cycleCount++;
            }
            roomCount++;
            score += 50;
            scoreDisplay.innerText = score;
            initRoom();
        }
        return;
    }

    if (keys['ArrowLeft'] && player.x > 0) player.x -= player.speed;
    if (keys['ArrowRight'] && player.x < canvas.width - player.width) player.x += player.speed;
    if (keys['ArrowUp'] && player.y > 0) player.y -= player.speed;
    if (keys['ArrowDown'] && player.y < canvas.height - player.height) player.y += player.speed;
}

function drawWarrior(x, y) {
    ctx.fillStyle = COLORS.darkest;
    ctx.fillRect(x + 6, y, 12, 12);
    ctx.fillRect(x + 2, y + 12, 21, 18);
    ctx.fillRect(x, y + 15, 4, 15);
    ctx.fillRect(x + 21, y + 15, 4, 15);
    ctx.fillRect(x + 4, y + 30, 6, 10);
    ctx.fillRect(x + 15, y + 30, 6, 10);
    ctx.fillStyle = COLORS.light;
    ctx.fillRect(x + 8, y + 4, 3, 3); ctx.fillRect(x + 14, y + 4, 3, 3);
}

function drawBoss() {
    const bx = canvas.width - 180 + (Math.random() * bossShake);
    const by = 100 + (Math.random() * bossShake);
    ctx.fillStyle = COLORS.darkest;
    ctx.beginPath();
    ctx.moveTo(bx, by + 50); ctx.lineTo(bx + 60, by); ctx.lineTo(bx + 120, by + 50);
    ctx.lineTo(bx + 120, by + 150); ctx.lineTo(bx, by + 150);
    ctx.fill();
    ctx.fillRect(bx + 10, by - 20, 15, 30); ctx.fillRect(bx + 95, by - 20, 15, 30);
    ctx.fillStyle = bossHp < 50 ? "red" : COLORS.light;
    ctx.beginPath(); ctx.arc(bx + 60, by + 70, 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.darkest;
    ctx.beginPath(); ctx.arc(bx + 60, by + 70, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.dark; ctx.fillRect(canvas.width - 200, 50, 150, 20);
    ctx.fillStyle = "red"; ctx.fillRect(canvas.width - 200, 50, (bossHp / 100) * 150, 20);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState === 'MENU') return;

    if (gameState === 'GAMEOVER') {
        ctx.fillStyle = "rgba(15, 56, 15, 0.9)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = COLORS.light;
        ctx.textAlign = "center";
        ctx.font = "bold 40px Arial";
        ctx.fillText("WARRIOR FALLEN", canvas.width/2, 80);

        ctx.font = "24px Arial";
        ctx.fillText(`Final Score: ${score}`, canvas.width/2, 130);
        ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s | Cycle: ${cycleCount}`, canvas.width/2, 165);

        ctx.font = "bold 26px Arial";
        ctx.fillText("--- LEADERBOARD ---", canvas.width/2, 220);

        const lb = getLeaderboard();
        if (lb.length === 0) {
            ctx.font = "18px Arial";
            ctx.fillText("No records yet!", canvas.width/2, 260);
        } else {
            lb.forEach((entry, i) => {
                ctx.font = "18px Arial";
                ctx.fillText(`#${i+1} - Score: ${entry.score} (Lvl ${entry.level}) - ${entry.time}s`, canvas.width/2, 260 + (i * 30));
            });
        }

        ctx.font = "bold 22px Arial";
        ctx.fillText("Press [Space] to restart", canvas.width/2, 450);
        return;
    }

    ctx.strokeStyle = COLORS.dark;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

    // 顯示計時器
    ctx.fillStyle = COLORS.darkest;
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Time: ${Math.floor(elapsedTime/1000)}s`, canvas.width - 20, 30);

    if (lastShot.timer > 0) {
        ctx.beginPath(); ctx.strokeStyle = COLORS.light; ctx.setLineDash([5, 5]);
        ctx.moveTo(player.x + player.width/2, player.y + player.height/2);
        ctx.lineTo(lastShot.x, lastShot.y); ctx.stroke(); ctx.setLineDash([]);
    }

    if (isBossMode && bossHp > 0) drawBoss();

    if (doorOpen || isExiting) {
        ctx.fillStyle = COLORS.darkest;
        ctx.fillRect(canvas.width - 50, canvas.height/2 - 50, 40, 100);
        ctx.fillStyle = COLORS.light; ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.fillText("EXIT", canvas.width - 30, canvas.height/2 - 60);
    }

    drawWarrior(player.x, player.y);

    gameObjects.forEach(obj => {
        ctx.fillStyle = COLORS.darkest;
        ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
        ctx.fillStyle = COLORS.light; ctx.font = "bold 20px Arial";
        ctx.textAlign = "center"; ctx.fillText(obj.number, obj.x + obj.width/2, obj.y + obj.height/2 + 7);
    });

    if (!isEntering && !isExiting) {
        ctx.strokeStyle = COLORS.darkest; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(mouse.x - 10, mouse.y); ctx.lineTo(mouse.x + 10, mouse.y);
        ctx.moveTo(mouse.x, mouse.y - 10); ctx.lineTo(mouse.x, mouse.y + 10);
        ctx.stroke();
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

initRoom();
gameLoop();
