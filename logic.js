'use strict';

// 벽돌 깨기: 규칙만 모아 둔 파일 (그리기·입력·소리 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 막대로 공을 튕겨 벽돌을 깬다. 철판(#)은 안 깨지고, 단단한 벽돌(2·3)은 여러 번 맞아야 깨진다
// - 철판 말고 다 깨면 스테이지 클리어(보너스 1000 × 스테이지). 7판 뒤로는 좌우 대칭 무작위 판
// - 벽돌을 깨면 가끔 아이템: 넓은 막대 · 공 3개 · 느린 공 · 레이저 · 불꽃 관통 · 생명 +1
// - 공을 모두 놓치면 목숨 하나. 목숨이 없으면 끝
// 소리·파편·글씨는 game.js 가 st.events 를 보고 만든다.
const LOGIC_BREAKOUT = (() => {
// ---------- 판 크기 ----------
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

// ---------- 스테이지 ----------
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
function randomLayout(n, rand = Math.random) {
  const rows = Math.min(6 + Math.floor(n / 3), 10);
  const hardP = Math.min(0.1 + n * 0.03, 0.45);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    // 철판은 3줄마다, 한쪽에 2개까지만 → 벽돌이 갇히는 판이 나오지 않는다
    let steel = r % 3 === 2 ? 2 : 0;
    let half = '';
    for (let c = 0; c < COLS / 2; c++) {
      const p = rand();
      if (p < 0.12) half += '.';
      else if (steel && p < 0.3) { half += '#'; steel--; }
      else if (rand() < hardP) half += rand() < 0.3 ? '3' : '2';
      else half += 'o';
    }
    lines.push(half + [...half].reverse().join(''));
  }
  return lines;
}
const layoutFor = (stage, rand) => (stage <= LAYOUTS.length ? LAYOUTS[stage - 1] : randomLayout(stage, rand));

function buildBricks(layout) {
  const bricks = [];
  layout.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch === '.') return;
      const kind = ch === '#' ? 'steel' : ch === 'o' ? 'normal' : 'hard';
      const hp = kind === 'hard' ? Number(ch) : 1;
      bricks.push({ x: BX0 + c * (BW + GAP), y: BY0 + r * (BH + GAP), row: r, col: c, kind, hp, maxHp: hp });
    });
  });
  return bricks;
}

// ---------- 게임·스테이지 ----------
function newGame(rand = Math.random) {
  const st = {
    rand, stage: 1, score: 0, lives: 3, phase: 'play',
    bricks: [], balls: [], items: [], lasers: [], paddle: { x: W / 2, w: PAD_W },
    effects: { wide: 0, slow: 0, laser: 0, fire: 0 }, combo: 0, stageTime: 0, laserCd: 0, events: [],
  };
  loadStage(st);
  return st;
}

function loadStage(st) {
  st.bricks = buildBricks(layoutFor(st.stage, st.rand));
  st.items = [];
  st.lasers = [];
  st.effects = { wide: 0, slow: 0, laser: 0, fire: 0 };
  st.stageTime = 0;
  st.paddle.x = W / 2;
  st.paddle.w = PAD_W;
  resetBall(st);
  st.phase = 'play';
}
function nextStage(st) { st.stage++; loadStage(st); }

function resetBall(st) {
  st.balls = [{ x: st.paddle.x, y: PAD_Y - BALL_R, vx: 0, vy: 0, stuck: true, offset: 0 }];
  st.combo = 0;
}

// ---------- 공 ----------
function ballSpeed(st) {
  const base = Math.min(300 + (st.stage - 1) * 18, 460);
  const ramp = Math.min(90, st.stageTime * 1.5);   // 한 판이 길어질수록 조금씩 빨라진다
  return (base + ramp) * (st.effects.slow > 0 ? 0.7 : 1);
}

function setVelocity(st, b, angle) {
  const s = ballSpeed(st);
  b.vx = s * Math.sin(angle);
  b.vy = -s * Math.cos(angle);
}

function normalize(st, b) {
  const s = ballSpeed(st);
  const len = Math.hypot(b.vx, b.vy) || 1;
  b.vx = (b.vx / len) * s;
  b.vy = (b.vy / len) * s;
  if (Math.abs(b.vy) < s * MIN_VY) {
    b.vy = Math.sign(b.vy || -1) * s * MIN_VY;
    b.vx = Math.sign(b.vx || 1) * Math.sqrt(s * s - b.vy * b.vy);
  }
}

// 막대에 붙은 공을 쏜다. 쏜 공이 있으면 true
function launch(st) {
  if (st.phase !== 'play') return false;
  let any = false;
  for (const b of st.balls) {
    if (!b.stuck) continue;
    b.stuck = false;
    setVelocity(st, b, (b.offset / (st.paddle.w / 2)) * MAX_BOUNCE * 0.6 + (st.rand() - 0.5) * 0.3);
    any = true;
  }
  if (any) st.events.push({ type: 'launch' });
  return any;
}

function circleHitsRect(cx, cy, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < BALL_R * BALL_R;
}

function brickAt(st, x, y) {
  for (const k of st.bricks) if (!k.dead && circleHitsRect(x, y, k.x, k.y, BW, BH)) return k;
  return null;
}

function updateBall(st, b, dt) {
  const paddle = st.paddle;
  if (b.stuck) { b.x = paddle.x + b.offset; b.y = PAD_Y - BALL_R; return; }
  normalize(st, b);
  // 한 프레임에 벽돌을 뚫고 지나가지 않게 반지름 절반씩 쪼개서 움직인다
  const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / (BALL_R * 0.5)));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const px = b.x, py = b.y;
    b.x += b.vx * sdt;
    b.y += b.vy * sdt;

    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); st.events.push({ type: 'wall' }); }
    else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); st.events.push({ type: 'wall' }); }
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); st.events.push({ type: 'wall' }); }

    // 막대: 맞은 위치에 따라 튕겨 나가는 각도가 정해진다
    const left = paddle.x - paddle.w / 2;
    if (b.vy > 0 && py <= PAD_Y && circleHitsRect(b.x, b.y, left, PAD_Y, paddle.w, PAD_H)) {
      const rel = Math.max(-1, Math.min(1, (b.x - paddle.x) / (paddle.w / 2)));
      setVelocity(st, b, rel * MAX_BOUNCE);
      b.y = PAD_Y - BALL_R;
      st.combo = 0;
      st.events.push({ type: 'paddle' });
      continue;
    }

    const k = brickAt(st, b.x, b.y);
    if (k) {
      const pierce = st.effects.fire > 0 && k.kind !== 'steel';
      damage(st, k, pierce ? k.hp : 1);
      if (st.phase !== 'play') return;
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

// 벽돌에 n 만큼 피해. 철판은 안 깨진다
function damage(st, k, n) {
  if (k.kind === 'steel') { st.events.push({ type: 'steel', k }); return; }
  k.hp -= n;
  if (k.hp > 0) { st.score += 10; st.events.push({ type: 'hit', k }); return; }

  k.dead = true;
  st.combo++;
  const pts = 50 * k.maxHp + (st.combo > 1 ? (st.combo - 1) * 10 : 0);
  st.score += pts;
  st.events.push({ type: 'break', k, pts, combo: st.combo });
  if (st.rand() < DROP_CHANCE) dropItem(st, k.x + BW / 2, k.y + BH / 2);
  st.bricks = st.bricks.filter((b) => !b.dead);
  if (st.bricks.every((b) => b.kind === 'steel')) stageClear(st);
}

// ---------- 아이템 ----------
function dropItem(st, x, y) {
  const total = ITEM_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = st.rand() * total;
  let type = ITEM_WEIGHTS[0][0];
  for (const [t, w] of ITEM_WEIGHTS) { if ((r -= w) < 0) { type = t; break; } }
  if (type === 'life' && st.lives >= MAX_LIVES) type = 'multi';
  st.items.push({ x, y, type });
}

function applyItem(st, type) {
  const it = ITEMS[type];
  if (it.dur) st.effects[type] = it.dur;
  if (type === 'multi') {
    const free = st.balls.filter((b) => !b.stuck);
    if (!free.length) launch(st);
    for (const b of st.balls.filter((b) => !b.stuck)) {
      for (const d of [-0.4, 0.4]) {
        if (st.balls.length >= MAX_BALLS) break;
        const a = Math.atan2(b.vx, -b.vy) + d;
        const nb = { x: b.x, y: b.y, vx: 0, vy: 0, stuck: false, offset: 0 };
        setVelocity(st, nb, a);
        st.balls.push(nb);
      }
    }
  }
  if (type === 'life') st.lives = Math.min(MAX_LIVES, st.lives + 1);
  st.score += 100;
  st.events.push({ type: 'item', item: type });
}

function fireLasers(st) {
  const off = st.paddle.w / 2 - 6;
  st.lasers.push({ x: st.paddle.x - off, y: PAD_Y - 2 }, { x: st.paddle.x + off, y: PAD_Y - 2 });
  st.events.push({ type: 'laser' });
}

// ---------- 목숨·스테이지 ----------
function loseLife(st) {
  st.lives--;
  st.items = [];
  st.lasers = [];
  st.effects = { wide: 0, slow: 0, laser: 0, fire: 0 };
  st.events.push({ type: 'lose' });
  if (st.lives <= 0) { st.phase = 'over'; st.events.push({ type: 'over' }); return; }
  resetBall(st);
}

function stageClear(st) {
  const bonus = 1000 * st.stage;
  st.score += bonus;
  st.phase = 'clear';
  st.items = [];
  st.lasers = [];
  st.events.push({ type: 'clear', bonus });
}

// ---------- 막대 ----------
function clampPaddle(st) {
  st.paddle.x = Math.max(st.paddle.w / 2, Math.min(W - st.paddle.w / 2, st.paddle.x));
}
function movePaddle(st, x) { st.paddle.x = x; clampPaddle(st); }

// ---------- 한 프레임 ----------
// input: { left, right } 키보드로 막대 움직이기
function update(st, dt, input = {}) {
  if (st.phase !== 'play') return;
  const paddle = st.paddle;
  if (input.left) paddle.x -= PAD_SPEED * dt;
  if (input.right) paddle.x += PAD_SPEED * dt;
  const targetW = st.effects.wide > 0 ? PAD_W_WIDE : PAD_W;
  paddle.w += (targetW - paddle.w) * Math.min(1, dt * 10);
  clampPaddle(st);

  for (const k of Object.keys(st.effects)) st.effects[k] = Math.max(0, st.effects[k] - dt);
  if (st.balls.some((b) => !b.stuck)) st.stageTime += dt;

  for (const b of st.balls) {
    updateBall(st, b, dt);
    if (st.phase !== 'play') break;
  }
  if (st.phase === 'play') {
    st.balls = st.balls.filter((b) => !b.dead);
    if (!st.balls.length) loseLife(st);
  }
  if (st.phase !== 'play') return;

  const left = paddle.x - paddle.w / 2;
  for (const it of st.items) {
    it.y += ITEM_SPEED * dt;
    if (it.y + 6 >= PAD_Y && it.y - 6 <= PAD_Y + PAD_H && it.x + 14 >= left && it.x - 14 <= left + paddle.w) {
      it.got = true;
      applyItem(st, it.type);
    }
  }
  st.items = st.items.filter((it) => !it.got && it.y < H + 10);

  if (st.effects.laser > 0 && (st.laserCd -= dt) <= 0) { st.laserCd = LASER_CD; fireLasers(st); }
  for (const l of st.lasers) {
    l.y -= LASER_SPEED * dt;
    const k = st.bricks.find((k) => l.x >= k.x && l.x <= k.x + BW && l.y <= k.y + BH && l.y + 10 >= k.y);
    if (k) {
      l.dead = true;
      damage(st, k, 1);
      if (st.phase !== 'play') break;
    }
  }
  st.lasers = st.lasers.filter((l) => !l.dead && l.y > -10);
}

return {
  W, H, COLS, BW, BH, GAP, BX0, BY0, PAD_Y, PAD_H, PAD_W, PAD_W_WIDE, PAD_SPEED, BALL_R, MAX_BOUNCE, MIN_VY, MAX_BALLS, MAX_LIVES,
  ITEM_SPEED, LASER_SPEED, LASER_CD, ITEMS, ITEM_WEIGHTS, DROP_CHANCE, LAYOUTS,
  randomLayout, layoutFor, buildBricks, newGame, loadStage, nextStage, resetBall, ballSpeed, setVelocity, normalize, launch,
  circleHitsRect, brickAt, updateBall, damage, dropItem, applyItem, fireLasers, loseLife, stageClear, clampPaddle, movePaddle, update,
};
})();
if (typeof module !== 'undefined') module.exports = LOGIC_BREAKOUT;
