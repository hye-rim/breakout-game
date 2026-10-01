'use strict';

// ---------- Field geometry ----------
const W = 360, H = 540;
const COLS = 10;
const BW = 32, BH = 14, GAP = 2;
const BX0 = (W - (COLS * BW + (COLS - 1) * GAP)) / 2;
const BY0 = 56;
const PAD_Y = H - 44, PAD_H = 12;
const PAD_W = 64, PAD_W_WIDE = 104;
const PAD_SPEED = 560;             // 키보드 이동 속도 (px/s)
const BALL_R = 6;
const MAX_BOUNCE = Math.PI / 3;    // 막대 끝에 맞으면 이 각도까지 꺾인다
const MIN_VY = 0.3;                // 수평으로 무한 왕복하지 않게 세로 성분 최소 비율
const MAX_BALLS = 12;
const MAX_LIVES = 5;
const ITEM_SPEED = 110;
const LASER_SPEED = 700;
const LASER_CD = 0.3;

const ROW_COLORS = [
  { base: '#ff4d6d', hi: '#ffc2cc', lo: '#a3122f' }, // red
  { base: '#ff9f1c', hi: '#ffdcae', lo: '#b35a00' }, // orange
  { base: '#ffd93d', hi: '#fff6c2', lo: '#b88a00' }, // yellow
  { base: '#4cd964', hi: '#c9f7d2', lo: '#1c8a33' }, // green
  { base: '#3fa7ff', hi: '#c7e6ff', lo: '#0b5aa8' }, // blue
  { base: '#b066ff', hi: '#e7ccff', lo: '#6420b0' }, // purple
  { base: '#ff7eb6', hi: '#ffd3e6', lo: '#b0306a' }, // pink
];
const HARD_COLORS = {
  2: { base: '#c9d1e0', hi: '#ffffff', lo: '#6b7590' }, // silver
  3: { base: '#ffcf40', hi: '#fff4c2', lo: '#a07400' }, // gold
};

const ITEMS = {
  wide:  { letter: 'W', color: '#3fa7ff', name: '넓은 막대', dur: 15 },
  multi: { letter: 'M', color: '#b066ff', name: '공 3개' },
  slow:  { letter: 'S', color: '#4cd964', name: '느린 공', dur: 10 },
  laser: { letter: 'L', color: '#ff4d6d', name: '레이저', dur: 10 },
  fire:  { letter: 'F', color: '#ff9f1c', name: '불꽃 관통', dur: 8 },
  life:  { letter: '♥', color: '#ff7eb6', name: '생명 +1' },
};
const ITEM_WEIGHTS = [['wide', 5], ['multi', 4], ['slow', 4], ['laser', 3], ['fire', 2], ['life', 1]];
const DROP_CHANCE = 0.14;

// ---------- Stages ----------
// o: 일반(줄마다 색) · 2/3: 여러 번 맞아야 깨지는 벽돌 · #: 철판(안 깨짐) · .: 빈칸
const LAYOUTS = [
  [
    '..........',
    'oooooooooo',
    'oooooooooo',
    'oooooooooo',
    'oooooooooo',
    'oooooooooo',
  ],
  [
    '....oo....',
    '...oooo...',
    '..oooooo..',
    '.oooooooo.',
    'oooooooooo',
    '2222222222',
  ],
  [
    'o.o.o.o.o.',
    '.o.o.o.o.o',
    '2.2.2.2.2.',
    '.2.2.2.2.2',
    'o.o.o.o.o.',
    '.o.o.o.o.o',
  ],
  [
    '3oooooooo3',
    'o2oooooo2o',
    'oo2oooo2oo',
    'ooo2oo2ooo',
    'oooooooooo',
    '###....###',
  ],
  [
    '..o....o..',
    '...o..o...',
    '..oooooo..',
    '.oo2oo2oo.',
    'oooooooooo',
    'o.oooooo.o',
    'o.o....o.o',
    '...oo.oo..',
  ],
  [
    '.oo....oo.',
    'oooo..oooo',
    'oo2oooo2oo',
    'ooo2222ooo',
    '.oooooooo.',
    '..oooooo..',
    '...oooo...',
    '....oo....',
  ],
  [
    '3333333333',
    '#.o.oo.o.#',
    '#oo2oo2oo#',
    '#oooooooo#',
    '#o######o#',
  ],
];

// 준비된 판을 다 깨면 좌우 대칭으로 무작위 생성. 단계가 오를수록 단단한 벽돌이 늘어난다.
function randomLayout(n) {
  const rows = Math.min(6 + Math.floor(n / 3), 10);
  const hardP = Math.min(0.1 + n * 0.03, 0.45);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    // 철판은 3줄마다, 한쪽에 2개까지만 → 벽돌이 갇히는 판이 나오지 않는다
    let steel = r % 3 === 2 ? 2 : 0;
    let half = '';
    for (let c = 0; c < COLS / 2; c++) {
      const p = Math.random();
      if (p < 0.12) half += '.';
      else if (steel && p < 0.3) { half += '#'; steel--; }
      else if (Math.random() < hardP) half += Math.random() < 0.3 ? '3' : '2';
      else half += 'o';
    }
    lines.push(half + [...half].reverse().join(''));
  }
  return lines;
}

// ---------- Canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const hudH = 62;   // 위 알약 점수판 + 판 테두리·그림자
  const scale = Math.min((innerWidth - 28) / W, (innerHeight - 30 - hudH) / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  // 점수판은 판보다 조금 넓어도 된다 (판이 작아지는 짧은 화면에서 점수 알약이 찌그러지지 않게)
  $('col').style.width = Math.max(cssW, Math.min(innerWidth - 16, 360)) + 'px';
}
addEventListener('resize', fit);

// ---------- Storage ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};

// ---------- Sound ----------
let audio = null;
let muted = store.get('breakoutMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  wall: () => tone(420, 0.03, 'square', 0.03),
  paddle: () => tone(260, 0.07, 'square', 0.07, 140),
  hit: () => tone(520, 0.05, 'triangle', 0.08),
  brk: (combo) => tone(620 + Math.min(combo, 14) * 45, 0.08, 'square', 0.05, 220),
  steel: () => tone(1250, 0.05, 'triangle', 0.05),
  laser: () => tone(950, 0.05, 'sawtooth', 0.025, -500),
  item: () => [660, 880, 1100].forEach((f, i) => setTimeout(() => tone(f, 0.08, 'sine', 0.08), i * 60)),
  launch: () => tone(380, 0.1, 'sine', 0.08, 300),
  lose: () => tone(320, 0.5, 'sawtooth', 0.08, -240),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.06), i * 110)),
  over: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.1), i * 180)),
};

// ---------- Game state ----------
let state = 'title';   // title | play | clear | over | paused
let stage = 1, score = 0, lives = 3, best = Number(store.get('breakoutBest')) || 0;
let bricks = [], balls = [], items = [], lasers = [], shards = [], texts = [];
const paddle = { x: W / 2, w: PAD_W };
let effects = { wide: 0, slow: 0, laser: 0, fire: 0 };
let combo = 0;
let stageTime = 0;
let laserCd = 0;
let shake = 0;
let clearTimer = 0;
let keys = {};

function buildBricks(layout) {
  bricks = [];
  layout.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === '.') return;
      const kind = ch === '#' ? 'steel' : ch === 'o' ? 'normal' : 'hard';
      const hp = kind === 'hard' ? Number(ch) : 1;
      bricks.push({
        x: BX0 + c * (BW + GAP), y: BY0 + r * (BH + GAP),
        kind, hp, maxHp: hp,
        color: kind === 'hard' ? HARD_COLORS[hp] : ROW_COLORS[r % ROW_COLORS.length],
        flash: 0,
      });
    });
  });
}

function startGame() {
  stage = 1;
  score = 0;
  lives = 3;
  loadStage();
}

function loadStage() {
  buildBricks(stage <= LAYOUTS.length ? LAYOUTS[stage - 1] : randomLayout(stage));
  items = [];
  lasers = [];
  effects = { wide: 0, slow: 0, laser: 0, fire: 0 };
  stageTime = 0;
  paddle.x = W / 2;
  paddle.w = PAD_W;
  resetBall();
  state = 'play';
  hideOverlay();
  updateHud();
}

function resetBall() {
  balls = [{ x: paddle.x, y: PAD_Y - BALL_R, vx: 0, vy: 0, stuck: true, offset: 0, trail: [] }];
  combo = 0;
}

function updateHud() {
  $('score').textContent = score.toLocaleString();
  $('stageNo').textContent = stage;
  $('lives').textContent = '♥' + lives;
  if (score > best) { best = score; store.set('breakoutBest', String(best)); }
  $('best').textContent = best.toLocaleString();
}

// ---------- Ball ----------
function ballSpeed() {
  const base = Math.min(300 + (stage - 1) * 18, 460);
  const ramp = Math.min(90, stageTime * 1.5);   // 한 판이 길어질수록 조금씩 빨라진다
  return (base + ramp) * (effects.slow > 0 ? 0.7 : 1);
}

function setVelocity(b, angle) {
  const s = ballSpeed();
  b.vx = s * Math.sin(angle);
  b.vy = -s * Math.cos(angle);
}

function normalize(b) {
  const s = ballSpeed();
  const len = Math.hypot(b.vx, b.vy) || 1;
  b.vx = (b.vx / len) * s;
  b.vy = (b.vy / len) * s;
  if (Math.abs(b.vy) < s * MIN_VY) {
    b.vy = Math.sign(b.vy || -1) * s * MIN_VY;
    b.vx = Math.sign(b.vx || 1) * Math.sqrt(s * s - b.vy * b.vy);
  }
}

function launch() {
  if (state !== 'play') return;
  let any = false;
  for (const b of balls) {
    if (!b.stuck) continue;
    b.stuck = false;
    setVelocity(b, (b.offset / (paddle.w / 2)) * MAX_BOUNCE * 0.6 + (Math.random() - 0.5) * 0.3);
    any = true;
  }
  if (any) sfx.launch();
}

function circleHitsRect(cx, cy, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < BALL_R * BALL_R;
}

function brickAt(x, y) {
  for (const k of bricks) if (!k.dead && circleHitsRect(x, y, k.x, k.y, BW, BH)) return k;
  return null;
}

function updateBall(b, dt) {
  if (b.stuck) { b.x = paddle.x + b.offset; b.y = PAD_Y - BALL_R; return; }
  normalize(b);
  // 한 프레임에 벽돌을 뚫고 지나가지 않게 반지름 절반씩 쪼개서 움직인다
  const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / (BALL_R * 0.5)));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const px = b.x, py = b.y;
    b.x += b.vx * sdt;
    b.y += b.vy * sdt;

    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); sfx.wall(); }
    else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); sfx.wall(); }
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); sfx.wall(); }

    // 막대: 맞은 위치에 따라 튕겨 나가는 각도가 정해진다
    const left = paddle.x - paddle.w / 2;
    if (b.vy > 0 && py <= PAD_Y && circleHitsRect(b.x, b.y, left, PAD_Y, paddle.w, PAD_H)) {
      const rel = Math.max(-1, Math.min(1, (b.x - paddle.x) / (paddle.w / 2)));
      setVelocity(b, rel * MAX_BOUNCE);
      b.y = PAD_Y - BALL_R;
      combo = 0;
      sfx.paddle();
      continue;
    }

    const k = brickAt(b.x, b.y);
    if (k) {
      const pierce = effects.fire > 0 && k.kind !== 'steel';
      damage(k, pierce ? k.hp : 1);
      if (state !== 'play') return;
      if (!pierce) {
        // 직전 위치가 벽돌의 어느 쪽 바깥이었는지로 튕길 축을 정한다
        const outX = px + BALL_R <= k.x || px - BALL_R >= k.x + BW;
        const outY = py + BALL_R <= k.y || py - BALL_R >= k.y + BH;
        if (outX && !outY) b.vx = -b.vx;
        else b.vy = -b.vy;
        b.x = px;
        b.y = py;
      }
    }

    if (b.y > H + BALL_R * 2) { b.dead = true; return; }
  }
}

function damage(k, n) {
  if (k.kind === 'steel') { k.flash = 0.15; sfx.steel(); return; }
  k.hp -= n;
  k.flash = 0.12;
  if (k.hp > 0) { score += 10; sfx.hit(); updateHud(); return; }

  k.dead = true;
  combo++;
  const pts = 50 * k.maxHp + (combo > 1 ? (combo - 1) * 10 : 0);
  score += pts;
  texts.push({ x: k.x + BW / 2, y: k.y + BH / 2, text: '+' + pts, t: 0, big: combo >= 5 });
  if (combo >= 5 && combo % 5 === 0) texts.push({ x: W / 2, y: H / 2, text: `${combo} COMBO!`, t: 0, big: true });
  for (let i = 0; i < 7; i++) {
    shards.push({
      x: k.x + Math.random() * BW, y: k.y + Math.random() * BH,
      vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 160,
      color: k.color.base, t: 0,
    });
  }
  sfx.brk(combo);
  if (Math.random() < DROP_CHANCE) dropItem(k.x + BW / 2, k.y + BH / 2);
  bricks = bricks.filter((b) => !b.dead);
  updateHud();
  if (bricks.every((b) => b.kind === 'steel')) stageClear();
}

// ---------- Items ----------
function dropItem(x, y) {
  const total = ITEM_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  let type = ITEM_WEIGHTS[0][0];
  for (const [t, w] of ITEM_WEIGHTS) { if ((r -= w) < 0) { type = t; break; } }
  if (type === 'life' && lives >= MAX_LIVES) type = 'multi';
  items.push({ x, y, type });
}

function applyItem(type) {
  const it = ITEMS[type];
  if (it.dur) effects[type] = it.dur;
  if (type === 'multi') {
    const free = balls.filter((b) => !b.stuck);
    if (!free.length) launch();
    for (const b of balls.filter((b) => !b.stuck)) {
      for (const d of [-0.4, 0.4]) {
        if (balls.length >= MAX_BALLS) break;
        const a = Math.atan2(b.vx, -b.vy) + d;
        const nb = { x: b.x, y: b.y, vx: 0, vy: 0, stuck: false, offset: 0, trail: [] };
        setVelocity(nb, a);
        balls.push(nb);
      }
    }
  }
  if (type === 'life') lives = Math.min(MAX_LIVES, lives + 1);
  score += 100;
  texts.push({ x: paddle.x, y: PAD_Y - 24, text: it.name, t: 0, big: true });
  sfx.item();
  updateHud();
}

function fireLasers() {
  const off = paddle.w / 2 - 6;
  lasers.push({ x: paddle.x - off, y: PAD_Y - 2 }, { x: paddle.x + off, y: PAD_Y - 2 });
  sfx.laser();
}

// ---------- Life / stage ----------
function loseLife() {
  lives--;
  items = [];
  lasers = [];
  effects = { wide: 0, slow: 0, laser: 0, fire: 0 };
  shake = 0.35;
  sfx.lose();
  updateHud();
  if (lives <= 0) { gameOver(); return; }
  resetBall();
}

function gameOver() {
  state = 'over';
  sfx.over();
  for (const k of bricks) {
    if (k.kind === 'steel') continue;
    shards.push({ x: k.x + BW / 2, y: k.y + BH / 2, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, color: '#6b7590', t: 0, delay: Math.random() * 0.6 });
  }
  setTimeout(() => showOverlay(`
    <h2 class="inked">GAME OVER</h2>
    <p class="big inked">${score.toLocaleString()}점</p>
    <p>STAGE ${stage}까지 도달${score >= best && score > 0 ? '<br>🏆 최고 기록!' : ''}</p>
    <button id="startBtn">다시 하기</button>`), 1200);
}

function stageClear() {
  const bonus = 1000 * stage;
  score += bonus;
  updateHud();
  state = 'clear';
  clearTimer = 0;
  items = [];
  lasers = [];
  sfx.clear();
  showOverlay(`
    <h2 class="inked">STAGE ${stage} CLEAR!</h2>
    <p class="big inked">보너스 +${bonus.toLocaleString()}</p>
    <button id="startBtn">다음 스테이지 ▶</button>`);
}

// ---------- Update ----------
function update(dt) {
  if (state === 'play') {
    if (keys.ArrowLeft || keys.KeyA) paddle.x -= PAD_SPEED * dt;
    if (keys.ArrowRight || keys.KeyD) paddle.x += PAD_SPEED * dt;
    const targetW = effects.wide > 0 ? PAD_W_WIDE : PAD_W;
    paddle.w += (targetW - paddle.w) * Math.min(1, dt * 10);
    clampPaddle();

    for (const k of Object.keys(effects)) effects[k] = Math.max(0, effects[k] - dt);
    if (balls.some((b) => !b.stuck)) stageTime += dt;

    for (const b of balls) {
      updateBall(b, dt);
      if (state !== 'play') break;
      b.trail.push([b.x, b.y]);
      if (b.trail.length > 6) b.trail.shift();
    }
    if (state === 'play') {
      balls = balls.filter((b) => !b.dead);
      if (!balls.length) loseLife();
    }
  }
  if (state === 'play') {
    const left = paddle.x - paddle.w / 2;
    for (const it of items) {
      it.y += ITEM_SPEED * dt;
      if (it.y + 6 >= PAD_Y && it.y - 6 <= PAD_Y + PAD_H && it.x + 14 >= left && it.x - 14 <= left + paddle.w) {
        it.got = true;
        applyItem(it.type);
      }
    }
    items = items.filter((it) => !it.got && it.y < H + 10);

    if (effects.laser > 0 && (laserCd -= dt) <= 0) { laserCd = LASER_CD; fireLasers(); }
    for (const l of lasers) {
      l.y -= LASER_SPEED * dt;
      const k = bricks.find((k) => l.x >= k.x && l.x <= k.x + BW && l.y <= k.y + BH && l.y + 10 >= k.y);
      if (k) {
        l.dead = true;
        damage(k, 1);
        if (state !== 'play') break;
      }
    }
    lasers = lasers.filter((l) => !l.dead && l.y > -10);
  }
  if (state === 'clear' && (clearTimer += dt) > 2.5) { stage++; loadStage(); }

  shake = Math.max(0, shake - dt);
  for (const k of bricks) k.flash = Math.max(0, k.flash - dt);
  for (const s of shards) {
    if (s.delay && (s.delay -= dt) > 0) continue;
    s.t += dt;
    s.vy += 900 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
  shards = shards.filter((s) => s.y < H + 10 && s.t < 1.5);
  for (const t of texts) { t.t += dt; t.y -= 30 * dt; }
  texts = texts.filter((t) => t.t < 1.1);
}

function clampPaddle() {
  paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));
}

// ---------- Draw (작은 오락실 공통 스티커 스타일: 진한 테두리 + 아래 그림자 + Jua) ----------
const INK = '#2b1d52';
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function label(text, x, y, size, fill = '#fff', align = 'center', stroke = INK) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (stroke) { ctx.lineWidth = Math.max(3, size * 0.24); ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); }
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

function drawBackground() {
  // 밝은 연보라 바닥 + 물방울 무늬 (알록달록한 벽돌과 흰 공이 잘 보이게)
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f6f3ff');
  g.addColorStop(1, '#ddd3ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(107,92,255,.07)';
  for (let y = 0; y < H; y += 24)
    for (let x = (y / 24) % 2 ? 12 : 0; x < W; x += 24) { ctx.beginPath(); ctx.arc(x + 6, y + 6, 3, 0, Math.PI * 2); ctx.fill(); }
}

function drawBrick(k) {
  const { x, y } = k;
  // 모든 벽돌: 아래로 떨어진 진한 그림자 + 테두리
  ctx.fillStyle = INK;
  roundRect(x, y + 1.5, BW, BH, 4);
  ctx.fill();
  let c;
  if (k.kind === 'steel') c = { hi: '#e3e6f0', base: '#9aa1b8', lo: '#5d6480' };
  else c = k.color;
  const g = ctx.createLinearGradient(0, y, 0, y + BH);
  g.addColorStop(0, c.hi);
  g.addColorStop(0.45, c.base);
  g.addColorStop(1, c.lo);
  ctx.fillStyle = g;
  roundRect(x, y, BW, BH, 4);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  roundRect(x + 4, y + 2.5, BW - 12, 2.5, 1.2);
  ctx.fill();
  if (k.kind === 'steel') {
    // 철판 리벳
    for (const rx of [x + 5, x + BW - 5]) {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(rx, y + BH / 2 + 0.5, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e3e6f0'; ctx.beginPath(); ctx.arc(rx - 0.5, y + BH / 2, 0.9, 0, Math.PI * 2); ctx.fill();
    }
  } else if (k.hp < k.maxHp) {
    // 금 간 자국: 맞은 횟수만큼
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + BW * 0.3, y + 1);
    ctx.lineTo(x + BW * 0.42, y + BH * 0.5);
    ctx.lineTo(x + BW * 0.34, y + BH - 2);
    if (k.maxHp - k.hp >= 2) {
      ctx.moveTo(x + BW * 0.72, y + 1);
      ctx.lineTo(x + BW * 0.6, y + BH * 0.55);
      ctx.lineTo(x + BW * 0.7, y + BH - 2);
    }
    ctx.stroke();
  }
  if (k.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${k.flash * 5})`;
    roundRect(x, y, BW, BH, 4);
    ctx.fill();
  }
}

function drawPaddle() {
  const x = paddle.x - paddle.w / 2, y = PAD_Y;
  const cap = effects.laser > 0 ? '#ff4d6d' : '#3fa7ff';
  if (effects.laser > 0) {
    // 레이저 포신
    for (const px of [x + 4, x + paddle.w - 10]) {
      ctx.fillStyle = INK; roundRect(px - 1, y - 8, 8, 11, 2); ctx.fill();
      ctx.fillStyle = cap; roundRect(px + 0.5, y - 6.5, 5, 8, 1.5); ctx.fill();
    }
  }
  ctx.fillStyle = INK;
  roundRect(x, y + 3, paddle.w, PAD_H, PAD_H / 2);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + PAD_H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#d9d2f5');
  ctx.fillStyle = g;
  roundRect(x, y, paddle.w, PAD_H, PAD_H / 2);
  ctx.fill();
  // 양 끝 색 캡
  ctx.save();
  roundRect(x, y, paddle.w, PAD_H, PAD_H / 2);
  ctx.clip();
  ctx.fillStyle = cap;
  ctx.fillRect(x, y, 14, PAD_H);
  ctx.fillRect(x + paddle.w - 14, y, 14, PAD_H);
  ctx.restore();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  roundRect(x, y, paddle.w, PAD_H, PAD_H / 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  roundRect(x + 16, y + 2.5, paddle.w - 32, 2.5, 1.2);
  ctx.fill();
}

function drawBall(b) {
  const fire = effects.fire > 0;
  for (let i = 0; i < b.trail.length; i++) {
    const [tx, ty] = b.trail[i];
    ctx.globalAlpha = (i + 1) / b.trail.length * (fire ? 0.6 : 0.3);
    ctx.fillStyle = fire ? '#ff9f1c' : '#8a7bff';
    ctx.beginPath();
    ctx.arc(tx, ty, BALL_R * (0.4 + i / b.trail.length * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(b.x, b.y + 1.2, BALL_R + 1.2, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, fire ? '#ff7a1a' : '#e3ddff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawItem(it) {
  const info = ITEMS[it.type];
  ctx.fillStyle = INK;
  roundRect(it.x - 15, it.y - 6, 30, 14, 7);
  ctx.fill();
  ctx.fillStyle = info.color;
  roundRect(it.x - 15, it.y - 7.5, 30, 14, 7);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  roundRect(it.x - 10, it.y - 5.5, 20, 3, 1.5);
  ctx.fill();
  label(info.letter, it.x, it.y + 0.5, 11, '#fff');
}

// 남은 효과 시간을 바닥에 알약 막대로
function drawEffects() {
  let x = 8;
  for (const k of ['wide', 'slow', 'laser', 'fire']) {
    if (effects[k] <= 0) continue;
    const info = ITEMS[k];
    ctx.fillStyle = INK;
    roundRect(x, H - 18, 54, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(x + 1.5, H - 16.5, 51, 9, 4.5);
    ctx.fill();
    ctx.fillStyle = info.color;
    roundRect(x + 1.5, H - 16.5, Math.max(10, 51 * effects[k] / info.dur), 9, 4.5);
    ctx.fill();
    label(info.letter, x + 8, H - 12, 9, '#fff');
    x += 60;
  }
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16);
  drawBackground();
  if (state !== 'over') for (const k of bricks) drawBrick(k);
  else for (const k of bricks) if (k.kind === 'steel') drawBrick(k);

  for (const s of shards) {
    if (s.delay > 0) continue;
    ctx.globalAlpha = Math.max(0, 1 - s.t / 1.5);
    ctx.fillStyle = INK;
    ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  for (const it of items) drawItem(it);
  for (const l of lasers) {
    ctx.fillStyle = INK; roundRect(l.x - 3, l.y - 1, 6, 12, 3); ctx.fill();
    ctx.fillStyle = '#ff5fa2'; roundRect(l.x - 1.5, l.y, 3, 10, 1.5); ctx.fill();
  }

  if (state !== 'over') {
    drawPaddle();
    for (const b of balls) drawBall(b);
  }
  drawEffects();

  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, (1.1 - t.t) * 3);
    label(t.text, t.x, t.y, t.big ? 20 : 15, t.big ? '#ffd23f' : '#fff');
  }
  ctx.globalAlpha = 1;

  if (state === 'play' && balls.some((b) => b.stuck)) {
    const s = 1 + Math.sin(performance.now() / 180) * 0.04;
    ctx.save();
    ctx.translate(W / 2, PAD_Y - 60);
    ctx.scale(s, s);
    label(matchMedia('(pointer: coarse)').matches ? '손을 떼면 발사!' : '클릭 · Space 로 발사!', 0, 0, 17, '#ffd23f');
    ctx.restore();
  }
  ctx.restore();
}

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (state !== 'paused') update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- Overlay ----------
function showOverlay(html) {
  const o = $('overlay');
  o.innerHTML = html;
  o.classList.remove('hidden');
  const btn = $('startBtn');
  if (btn) btn.onclick = onOverlayButton;
}
function hideOverlay() { $('overlay').classList.add('hidden'); }

function onOverlayButton() {
  if (state === 'clear') { stage++; loadStage(); }
  else if (state === 'paused') resume();
  else startGame();
}

function pause() {
  if (state !== 'play') return;
  state = 'paused';
  drag = null;
  showOverlay(`<h2 class="inked">일시정지</h2><button id="startBtn">계속하기</button>`);
}
function resume() {
  if (state !== 'paused') return;
  state = 'play';
  hideOverlay();
}

// ---------- Input ----------
// 마우스: 커서 위치를 그대로 따라간다.
// 터치: 손가락이 막대를 가리지 않게 화면 어디서든 드래그한 만큼 움직이고, 손을 떼면 발사.
const toLocalX = (clientX) => {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (W / rect.width);
};
let drag = null;

addEventListener('pointerdown', (e) => {
  if (state !== 'play' || e.target.closest('button')) return;
  if (e.pointerType === 'mouse') {
    if (e.target === canvas) launch();
    return;
  }
  drag = { id: e.pointerId, lastX: e.clientX };
});
addEventListener('pointermove', (e) => {
  if (state !== 'play') return;
  if (e.pointerType === 'mouse') {
    paddle.x = toLocalX(e.clientX);
    clampPaddle();
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const rect = canvas.getBoundingClientRect();
  paddle.x += (e.clientX - drag.lastX) * (W / rect.width) * 1.3;
  drag.lastX = e.clientX;
  clampPaddle();
});
// 아이폰 등에서는 브라우저가 터치를 스크롤·제스처로 가져가면 pointerup 대신 pointercancel 을 보낸다.
// 예전엔 취소되면 그냥 버려서, 손을 뗐는데도 발사가 안 돼 '탭이 안 먹는' 것처럼 느껴졌다.
// → 취소돼도 뗀 것으로 치고, 혹시 포인터 이벤트가 빠져도 touchend 로 한 번 더 처리한다 (두 번 불려도 한 번만 발사).
// 캔버스 위 터치는 스크롤·확대로 쓰지 말라고 브라우저에 알린다.
function releaseTouch() {
  if (!drag) return;
  drag = null;
  launch();
}
addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) releaseTouch(); });
addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) releaseTouch(); });
addEventListener('touchend', (e) => {
  if (state !== 'play' || e.target.closest?.('button')) return;
  drag = null;
  launch();
}, { passive: true });
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (state === 'play') launch();
    else if (state !== 'over' || !$('overlay').classList.contains('hidden')) onOverlayButton();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') state === 'paused' ? resume() : pause();
  if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { keys = {}; pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function toggleMute() {
  muted = !muted;
  store.set('breakoutMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('startBtn').onclick = onOverlayButton;
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// 타이틀 화면 뒤에 깔아둘 판
buildBricks(LAYOUTS[0]);
resetBall();
updateHud();
fit();
requestAnimationFrame(frame);
