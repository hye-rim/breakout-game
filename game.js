'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 벽돌 깨기: 화면·입력·소리. 규칙(벽돌·공·아이템·목숨·스테이지)은 logic.js (LOGIC_BREAKOUT) 에 있고,
// 여기서는 규칙이 남긴 st.events 를 보고 소리·파편·글씨·안내창을 만든다.
const L = LOGIC_BREAKOUT;
const { W, H, BW, BH, PAD_Y, PAD_H, BALL_R, ITEMS } = L;

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

// ---------- Canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const hudH = 62;   // 위 알약 점수판 + 판 테두리·그림자
  const scale = Math.min((innerWidth - 28) / W, (innerHeight - 30 - hudH) / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
let best = Number(store.get('breakoutBest')) || 0;
let G = L.newGame();   // 타이틀 화면 뒤에 깔아둘 판
let shards = [], texts = [];
const trails = new WeakMap();   // 공마다 꼬리 자국
let shake = 0;
let clearTimer = 0;
let keys = {};

// 벽돌 색: 줄마다 무지개, 단단한 벽돌은 은·금
function paint() {
  for (const k of G.bricks) k.color = k.kind === 'hard' ? HARD_COLORS[k.maxHp] : ROW_COLORS[k.row % ROW_COLORS.length];
}

function startGame() {
  G = L.newGame();
  enterStage();
}
function nextStage() {
  L.nextStage(G);
  enterStage();
}
function enterStage() {
  paint();
  state = 'play';
  hideOverlay();
  updateHud();
}

function updateHud() {
  $('score').textContent = G.score.toLocaleString();
  $('stageNo').textContent = G.stage;
  $('lives').textContent = '♥' + G.lives;
  if (G.score > best) { best = G.score; store.set('breakoutBest', String(best)); }
  $('best').textContent = best.toLocaleString();
}

function launch() {
  if (state !== 'play') return;
  L.launch(G);
  handleEvents();
}

// 규칙이 남긴 일들 → 소리·파편·글씨·안내창
function handleEvents() {
  if (!G.events.length) return;
  for (const e of G.events.splice(0)) {
    tutorialSignal(e.type);
    if (e.type === 'launch') sfx.launch();
    else if (e.type === 'wall') sfx.wall();
    else if (e.type === 'paddle') sfx.paddle();
    else if (e.type === 'steel') { e.k.flash = 0.15; sfx.steel(); }
    else if (e.type === 'hit') { e.k.flash = 0.12; sfx.hit(); }
    else if (e.type === 'break') {
      const k = e.k;
      texts.push({ x: k.x + BW / 2, y: k.y + BH / 2, text: '+' + e.pts, t: 0, big: e.combo >= 5 });
      if (e.combo >= 5 && e.combo % 5 === 0) texts.push({ x: W / 2, y: H / 2, text: `${e.combo} COMBO!`, t: 0, big: true });
      for (let i = 0; i < 7; i++) {
        shards.push({
          x: k.x + Math.random() * BW, y: k.y + Math.random() * BH,
          vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 160,
          color: k.color.base, t: 0,
        });
      }
      sfx.brk(e.combo);
    } else if (e.type === 'item') {
      texts.push({ x: G.paddle.x, y: PAD_Y - 24, text: ITEMS[e.item].name, t: 0, big: true });
      sfx.item();
    } else if (e.type === 'laser') sfx.laser();
    else if (e.type === 'lose') { shake = 0.35; sfx.lose(); }
    else if (e.type === 'over') gameOver();
    else if (e.type === 'clear') stageClear(e.bonus);
  }
  updateHud();
}

function gameOver() {
  state = 'over';
  sfx.over();
  for (const k of G.bricks) {
    if (k.kind === 'steel') continue;
    shards.push({ x: k.x + BW / 2, y: k.y + BH / 2, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, color: '#6b7590', t: 0, delay: Math.random() * 0.6 });
  }
  setTimeout(() => showOverlay(`
    <h2 class="inked">GAME OVER</h2>
    <p class="big inked">${G.score.toLocaleString()}점</p>
    <p>STAGE ${G.stage}까지 도달${G.score >= best && G.score > 0 ? '<br>🏆 최고 기록!' : ''}</p>
    <button id="startBtn">다시 하기</button>`), 1200);
}

function stageClear(bonus) {
  state = 'clear';
  clearTimer = 0;
  sfx.clear();
  showOverlay(`
    <h2 class="inked">STAGE ${G.stage} CLEAR!</h2>
    <p class="big inked">보너스 +${bonus.toLocaleString()}</p>
    <button id="startBtn">다음 스테이지 ▶</button>`);
}

// ---------- Update ----------
function update(dt) {
  if (state === 'play') {
    L.update(G, dt, { left: keys.ArrowLeft || keys.KeyA, right: keys.ArrowRight || keys.KeyD });
    for (const b of G.balls) {
      let t = trails.get(b);
      if (!t) trails.set(b, (t = []));
      t.push([b.x, b.y]);
      if (t.length > 6) t.shift();
    }
    handleEvents();
  }
  if (state === 'clear' && (clearTimer += dt) > 2.5) nextStage();

  shake = Math.max(0, shake - dt);
  for (const k of G.bricks) k.flash = Math.max(0, (k.flash || 0) - dt);
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
  const { paddle, effects } = G;
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
  const fire = G.effects.fire > 0;
  const trail = trails.get(b) || [];
  for (let i = 0; i < trail.length; i++) {
    const [tx, ty] = trail[i];
    ctx.globalAlpha = (i + 1) / trail.length * (fire ? 0.6 : 0.3);
    ctx.fillStyle = fire ? '#ff9f1c' : '#8a7bff';
    ctx.beginPath();
    ctx.arc(tx, ty, BALL_R * (0.4 + i / trail.length * 0.5), 0, Math.PI * 2);
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
  const { effects } = G;
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
  const { bricks, items, lasers, balls } = G;
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
  if (state === 'clear') nextStage();
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
    L.movePaddle(G, toLocalX(e.clientX));
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const rect = canvas.getBoundingClientRect();
  L.movePaddle(G, G.paddle.x + (e.clientX - drag.lastX) * (W / rect.width) * 1.3);
  drag.lastX = e.clientX;
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

paint();
updateHud();
fit();
requestAnimationFrame(frame);
