'use strict';
// 벽돌 깨기 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DT = 1 / 60;

// 판 아래쪽(벽돌 줄 바로 밑)에서 철판만 피해 상하좌우로 닿을 수 있는 칸들. 안 닿는 벽돌은 영영 못 깬다
function trapped(layout) {
  const R = layout.length, C = L.COLS;
  const seen = new Set(), q = [];
  for (let c = 0; c < C; c++) { seen.add(`${R},${c}`); q.push([R, c]); }   // 벽돌 밑 빈 공간
  while (q.length) {
    const [r, c] = q.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < -1 || nr > R || nc < 0 || nc >= C || seen.has(`${nr},${nc}`)) continue;
      if (nr >= 0 && nr < R && layout[nr][nc] === '#') continue;
      seen.add(`${nr},${nc}`); q.push([nr, nc]);
    }
  }
  const out = [];
  layout.forEach((line, r) => [...line].forEach((ch, c) => { if (ch !== '.' && ch !== '#' && !seen.has(`${r},${c}`)) out.push([r, c]); }));
  return out;
}

test('stage layouts: ten wide, every breakable brick can be reached', () => {
  for (const layout of L.LAYOUTS) {
    for (const line of layout) assert.strictEqual(line.length, L.COLS);
    assert.deepStrictEqual(trapped(layout), []);
  }
  for (let n = 8; n <= 60; n++) {
    for (let s = 1; s <= 20; s++) {
      const layout = L.randomLayout(n, rng(n * 100 + s));
      assert.strictEqual(layout.length, Math.min(6 + Math.floor(n / 3), 10));
      for (const line of layout) {
        assert.strictEqual(line.length, L.COLS);
        assert.strictEqual(line, [...line].reverse().join(''), 'mirror-symmetric');
      }
      assert.deepStrictEqual(trapped(layout), [], `stage ${n} seed ${s}`);
      assert.ok(layout.join('').replace(/[.#]/g, '').length > 0, 'something to break');
    }
  }
});

test('bricks: positions inside the field, hard bricks keep their hit points', () => {
  const b = L.buildBricks(L.LAYOUTS[3]);
  for (const k of b) {
    assert.ok(k.x >= 0 && k.x + L.BW <= L.W && k.y >= 0 && k.y + L.BH < L.PAD_Y);
    if (k.kind === 'hard') assert.ok(k.hp === 2 || k.hp === 3);
  }
  assert.strictEqual(b.filter((k) => k.kind === 'steel').length, 6);
});

test('launch and walls: the ball keeps its speed and never goes flat', () => {
  const st = L.newGame(rng(1));
  st.bricks = [];                                        // 빈 판에서 벽만 튕기기 (클리어는 일부러 안 부른다)
  assert.ok(L.launch(st));
  assert.ok(!L.launch(st), 'nothing left to launch');
  const b = st.balls[0];
  for (let k = 0; k < 2000; k++) {
    L.movePaddle(st, b.x);                               // 막대가 늘 공 밑에
    L.update(st, DT);
    const s = L.ballSpeed(st), v = Math.hypot(b.vx, b.vy);
    assert.ok(Math.abs(v - s) < 1e-6 * s + 1e-6 || st.balls[0] !== b);
    assert.ok(Math.abs(b.vy) >= s * L.MIN_VY - 1e-6);
    assert.ok(b.x >= L.BALL_R - 1e-9 && b.x <= L.W - L.BALL_R + 1e-9 && b.y >= L.BALL_R - 1e-9);
  }
  assert.strictEqual(st.lives, 3, 'the ball was never lost');
  assert.ok(st.events.some((e) => e.type === 'wall') && st.events.some((e) => e.type === 'paddle'));
});

test('paddle angle: the centre sends the ball straight up, the edge at the steepest angle', () => {
  const st = L.newGame(rng(2));
  st.bricks = [];
  const hit = (dx) => {
    const b = { x: st.paddle.x + dx, y: L.PAD_Y - L.BALL_R - 2, vx: 0, vy: L.ballSpeed(st), stuck: false };
    st.balls = [b];
    L.updateBall(st, b, 0.01);
    return Math.atan2(b.vx, -b.vy);
  };
  assert.ok(Math.abs(hit(0)) < 1e-9);
  assert.ok(Math.abs(hit(st.paddle.w / 2) - L.MAX_BOUNCE) < 1e-9);
  assert.ok(Math.abs(hit(-st.paddle.w / 2) + L.MAX_BOUNCE) < 1e-9);
});

test('damage and score: hard bricks need several hits, steel never breaks, combos add up', () => {
  const st = L.newGame(rng(3));
  const gold = { x: 0, y: 0, kind: 'hard', hp: 3, maxHp: 3 }, steel = { x: 40, y: 0, kind: 'steel', hp: 1, maxHp: 1 };
  const a = { x: 80, y: 0, kind: 'normal', hp: 1, maxHp: 1 };
  st.bricks = [gold, steel, a, { x: 120, y: 0, kind: 'normal', hp: 1, maxHp: 1 }];
  st.rand = () => 0.99;                                  // 아이템 안 떨어지게
  L.damage(st, gold, 1); L.damage(st, gold, 1);
  assert.strictEqual(st.score, 20);
  assert.ok(st.bricks.includes(gold));
  L.damage(st, gold, 1);
  assert.ok(!st.bricks.includes(gold));
  assert.strictEqual(st.score, 20 + 150);
  L.damage(st, steel, 99);
  assert.ok(st.bricks.includes(steel));
  L.damage(st, a, 1);
  assert.strictEqual(st.score, 20 + 150 + 50 + 10, 'second brick in a row gets +10 combo');
  assert.strictEqual(st.phase, 'play');
});

test('clearing every breakable brick clears the stage with a stage bonus', () => {
  const st = L.newGame(rng(4));
  st.stage = 4; L.loadStage(st);
  st.rand = () => 0.99;
  const before = st.score;
  let gained = 0;
  for (const k of st.bricks.filter((k) => k.kind !== 'steel')) { const s = st.score; L.damage(st, k, k.hp); gained += st.score - s; }
  assert.strictEqual(st.phase, 'clear');
  assert.ok(st.events.some((e) => e.type === 'clear' && e.bonus === 4000));
  assert.ok(st.score - before === gained && gained > 4000);
  L.nextStage(st);
  assert.strictEqual(st.stage, 5);
  assert.strictEqual(st.phase, 'play');
});

test('items: drops respect the life cap, multi-ball is capped, effects last their time', () => {
  const st = L.newGame(rng(5));
  st.lives = L.MAX_LIVES;
  for (let k = 0; k < 2000; k++) L.dropItem(st, 0, 0);
  assert.ok(!st.items.some((it) => it.type === 'life'), 'no extra life at the cap');
  st.lives = 3;
  st.items = [];
  for (let k = 0; k < 2000; k++) L.dropItem(st, 0, 0);
  const share = st.items.filter((it) => it.type === 'wide').length / st.items.length;
  assert.ok(share > 0.2 && share < 0.33, 'wide is the most common: ' + share);
  L.launch(st);
  for (let k = 0; k < 10; k++) L.applyItem(st, 'multi');
  assert.strictEqual(st.balls.length, L.MAX_BALLS);
  L.applyItem(st, 'life'); L.applyItem(st, 'life'); L.applyItem(st, 'life');
  assert.strictEqual(st.lives, L.MAX_LIVES);
  L.applyItem(st, 'slow');
  const slowSpeed = L.ballSpeed(st);
  for (let k = 0; k < 11 * 60; k++) { L.movePaddle(st, st.balls[0].x); L.update(st, DT); }
  assert.ok(L.ballSpeed(st) > slowSpeed, 'slow wore off after 10 seconds');
});

test('missing every ball costs a life; the last life ends the game', () => {
  const st = L.newGame(rng(6));
  L.launch(st);
  st.paddle.x = 1e9;                                     // 막대를 치워 둔다 (clamp 는 update 가 한다)
  let lost = 0;
  for (let k = 0; k < 60 * 60 && st.phase === 'play'; k++) {
    st.paddle.x = st.balls[0] && st.balls[0].x < L.W / 2 ? L.W : 0;   // 일부러 공 반대쪽에
    L.update(st, DT);
    if (st.events.some((e) => e.type === 'lose')) { lost++; st.events = []; if (st.phase === 'play') L.launch(st); }
  }
  assert.strictEqual(lost, 3);
  assert.strictEqual(st.phase, 'over');
  assert.strictEqual(st.lives, 0);
});

test('an autopilot that keeps the paddle under the lowest ball clears the first ten stages', () => {
  for (const seed of [1, 2, 3]) {
    const st = L.newGame(rng(seed)), aimRand = rng(seed + 100);
    let aim = 0;
    for (let stage = 1; stage <= 10; stage++) {
      assert.strictEqual(st.stage, stage);
      let t = 0;
      while (st.phase === 'play' && t < 900) {
        if (st.balls.some((b) => b.stuck)) L.launch(st);
        const ball = st.balls.filter((b) => !b.stuck && b.vy > 0).sort((a, b) => b.y - a.y)[0] || st.balls[0];
        L.movePaddle(st, ball.x - aim * st.paddle.w / 2);  // 사람처럼 받을 때마다 막대의 다른 자리로 받는다
        L.update(st, DT);
        t += DT;
        if (st.events.some((e) => e.type === 'paddle')) aim = (aimRand() - 0.5) * 1.4;
        st.events.length = 0;
      }
      assert.strictEqual(st.phase, 'clear', `seed ${seed} stage ${stage} cleared (${st.bricks.filter((k) => k.kind !== 'steel').length} left after ${t.toFixed(0)}s)`);
      L.nextStage(st);
    }
    assert.ok(st.lives >= 3, 'the autopilot never lost a life (it may have caught a ♥)');
  }
});
