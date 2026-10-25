// main.js: game flow, UI wiring and input. Drawing is delegated to a view:
// the 3D view (scene3d.js) or, if WebGL is unavailable, the 2D board below.
import { T, generateLevel, traceBeam, levelConfig, CAMPAIGN_LEVELS, HARD_LEVELS } from './puzzle.js';
import { audio } from './audio.js';
import { createView3D } from './scene3d.js';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');

/* ---------- 2D fallback view (same API as the 3D view) ---------- */
function createFlatView(host) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, level = null, res = null;

  function layout() {
    const n = level.n;
    const s = Math.min((W * 0.9) / n, (H * 0.6) / n);
    return { s, ox: (W - n * s) / 2, oy: H * 0.5 - (n * s) / 2 };
  }
  function centre(L, x, y) {
    return { x: L.ox + (x + 0.5) * L.s, y: L.oy + (level.n - 1 - y + 0.5) * L.s };
  }
  function rounded(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!level) return;
    const L = layout();
    const { s, ox, oy } = L;
    const n = level.n;

    ctx.fillStyle = '#1b2140';
    rounded(ox - s * 0.35, oy - s * 0.35, n * s + s * 0.7, n * s + s * 0.7, s * 0.3);
    ctx.fill();

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const cell = level.cells[y][x];
        const pad = s * 0.05;
        ctx.fillStyle = cell.type === T.WALL ? '#080a14' : '#2c3566';
        rounded(ox + x * s + pad, oy + (n - 1 - y) * s + pad, s - 2 * pad, s - 2 * pad, s * 0.1);
        ctx.fill();

        const c = centre(L, x, y);
        if (cell.type === T.MIRROR) {
          const colour = cell.locked ? '#d9a64a' : '#e6ecff';
          const h = s * 0.36;
          ctx.strokeStyle = colour;
          ctx.lineCap = 'round';
          ctx.lineWidth = s * 0.08;
          ctx.shadowColor = colour;
          ctx.shadowBlur = s * 0.15;
          ctx.beginPath();
          if (cell.orient === 0) {
            ctx.moveTo(c.x - h, c.y + h);
            ctx.lineTo(c.x + h, c.y - h);
          } else {
            ctx.moveTo(c.x - h, c.y - h);
            ctx.lineTo(c.x + h, c.y + h);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        if (cell.type === T.SOURCE) {
          ctx.fillStyle = '#ffe2a8';
          ctx.shadowColor = '#ffa030';
          ctx.shadowBlur = s * 0.4;
          ctx.beginPath();
          ctx.arc(c.x, c.y, s * 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        if (cell.type === T.TARGET) {
          ctx.strokeStyle = res && res.reached ? '#9ff7c8' : '#6fe3ff';
          ctx.lineWidth = s * 0.07;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = s * 0.3;
          ctx.beginPath();
          ctx.arc(c.x, c.y, s * 0.26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    }

    if (res && res.points.length > 1) {
      ctx.strokeStyle = '#ffc26b';
      ctx.shadowColor = '#ffa030';
      ctx.shadowBlur = s * 0.35;
      ctx.lineWidth = s * 0.07;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      res.points.forEach((p, i) => {
        const c = centre(L, p.x, p.y);
        if (i) ctx.lineTo(c.x, c.y);
        else ctx.moveTo(c.x, c.y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  return {
    kind: '2d',
    build(lv) { level = lv; res = null; draw(); },
    setMirror() { draw(); },
    beam(r) { res = r; draw(); },
    fit() {},
    tick() {},
    resize() {
      const dpr = Math.min(window.devicePixelRatio, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    },
    pick(e) {
      if (!level) return null;
      const r = canvas.getBoundingClientRect();
      const L = layout();
      const x = Math.floor((e.clientX - r.left - L.ox) / L.s);
      const row = Math.floor((e.clientY - r.top - L.oy) / L.s);
      if (x < 0 || row < 0 || x >= level.n || row >= level.n) return null;
      return level.cells[level.n - 1 - row][x];
    },
  };
}

/* ---------- choose a view ---------- */
const forceFlat = /[?&]2d\b/.test(window.location.search);
let view = null;
if (!forceFlat) {
  try {
    view = createView3D(stage);
  } catch (err) {
    console.warn('3D view unavailable, using the 2D board.', err);
    stage.innerHTML = '';
  }
}
if (!view) view = createFlatView(stage);
view.resize();

/* ---------- game state ---------- */
const state = {
  mode: 'campaign', idx: 0, count: CAMPAIGN_LEVELS, hard: false,
  status: 'idle', // idle | playing | won | lost
  moves: 0, limit: null, timeLeft: 0, timeLimit: 0, startOrient: [],
};
let menuMode = 'campaign';
let cur = null;        // current generated level
let mirrorCells = [];  // mirror cells of the current level, in a fixed order
let time = 0;

const PKEY = 'prismpath.progress';
let progress = loadProgress();
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PKEY) || 'null');
    if (p && p.unlocked && p.best) return p;
  } catch (_) { /* storage blocked */ }
  return { unlocked: { campaign: 1, hard: 1 }, best: {} };
}
function saveProgress() {
  try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch (_) { /* ignore */ }
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3000);
}

function collectMirrors(level) {
  const list = [];
  for (const row of level.cells) for (const c of row) if (c.type === T.MIRROR) list.push(c);
  return list;
}

/* ---------- beam and rotation ---------- */
function rebuildBeam(playSfx = false) {
  const res = traceBeam(cur.cells, cur.n, cur.source);
  view.beam(res, cur);
  audio.setHum(state.status === 'playing');
  if (playSfx) audio.beamTravel(res.points.length);
  return res;
}

function rotateCell(cell) {
  cell.orient ^= 1;
  view.setMirror(cell);
  state.moves++;
  audio.rotate();
  const res = rebuildBeam(true);
  updateHud();
  if (res.reached) return win();
  if (state.limit !== null && state.moves === state.limit && !res.reached) {
    audio.warn();
    toast('Last move allowed. One more and the level fails.');
  }
  if (state.limit !== null && state.moves > state.limit) lose('moves');
}

/* ---------- game flow ---------- */
function startLevel(mode, idx) {
  const cfg = levelConfig(mode, idx);
  const level = generateLevel(cfg);
  cur = level;
  Object.assign(state, {
    mode, idx,
    count: mode === 'hard' ? HARD_LEVELS : CAMPAIGN_LEVELS,
    hard: mode === 'hard',
    status: 'playing',
    moves: 0,
    timeLimit: cfg.timeLimit,
    timeLeft: cfg.timeLimit,
    limit: mode === 'hard' ? level.optimal + cfg.moveSlack : null,
  });
  view.build(level);
  mirrorCells = collectMirrors(level);
  state.startOrient = mirrorCells.map((c) => c.orient);
  view.fit(level.n);
  rebuildBeam(false);
  showPlaying();
  updateHud();
  toast(state.hard
    ? 'Hard: light the receptor within the move limit and the timer.'
    : 'Click a mirror to turn it. Light from the emitter must reach the receptor.');
}

function restartLevel() {
  state.moves = 0;
  state.timeLeft = state.timeLimit;
  state.status = 'playing';
  mirrorCells.forEach((c, i) => {
    c.orient = state.startOrient[i];
    view.setMirror(c);
  });
  rebuildBeam(false);
  showPlaying();
  updateHud();
}

function win() {
  state.status = 'won';
  const stars = state.moves <= cur.optimal ? 3 : state.moves <= cur.optimal + 2 ? 2 : 1;
  const k = `${state.mode}-${state.idx}`;
  progress.best[k] = Math.max(progress.best[k] || 0, stars);
  progress.unlocked[state.mode] = Math.min(Math.max(progress.unlocked[state.mode] || 1, state.idx + 2), state.count);
  saveProgress();
  audio.lock();
  setTimeout(() => audio.win(), 250);
  setTimeout(() => {
    showResult({
      won: true,
      stars,
      title: 'Beam locked',
      text: stars === 3
        ? `Perfect route in ${state.moves} moves.`
        : `Solved in ${state.moves} moves. The fewest possible is ${cur.optimal}.`,
      hasNext: state.idx + 1 < state.count,
    });
    if ((state.idx + 1) % 100 === 0) audio.milestone();
    else audio.star(stars);
  }, 1100);
}

function lose(reason) {
  if (state.status !== 'playing') return;
  state.status = 'lost';
  audio.fail();
  setTimeout(() => showResult({
    won: false,
    title: reason === 'time' ? 'Out of time' : 'Too many moves',
    text: reason === 'time'
      ? 'The timer ran out. Restart and plan the route before you turn mirrors.'
      : 'You went over the move limit. Restart and trace the route first.',
    hasNext: false,
  }), 500);
}

/* ---------- panels, HUD, modal ---------- */
const overlay = $('#overlay');
const hud = $('#hud');
const modal = $('#modal-result');
const panels = {
  menu: $('#panel-menu'),
  levels: $('#panel-levels'),
  howto: $('#panel-howto'),
  settings: $('#panel-settings'),
};

function showPanel(name) {
  for (const k in panels) panels[k].hidden = k !== name;
  overlay.hidden = false;
  hud.hidden = true;
  modal.hidden = true;
  if (name === 'levels') renderLevels();
  if (name === 'settings') syncSettings();
  const first = panels[name].querySelector('button');
  if (first) first.focus({ preventScroll: true });
}

function showPlaying() {
  overlay.hidden = true;
  modal.hidden = true;
  hud.hidden = false;
}

function starSvg(on) {
  return `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
}

const LEVELS_PER_PAGE = 50;
let levelPage = 0;

function openLevels(mode) {
  menuMode = mode;
  const count = mode === 'hard' ? HARD_LEVELS : CAMPAIGN_LEVELS;
  levelPage = Math.floor(Math.min((progress.unlocked[mode] || 1) - 1, count - 1) / LEVELS_PER_PAGE);
  showPanel('levels');
}

function renderLevels() {
  const count = menuMode === 'hard' ? HARD_LEVELS : CAMPAIGN_LEVELS;
  const pages = Math.ceil(count / LEVELS_PER_PAGE);
  levelPage = Math.max(0, Math.min(levelPage, pages - 1));
  const from = levelPage * LEVELS_PER_PAGE;
  const to = Math.min(count, from + LEVELS_PER_PAGE);

  $('#levels-title').textContent = menuMode === 'hard' ? 'Hard Mode' : 'Campaign';
  $('#levels-note').textContent = menuMode === 'hard'
    ? 'Bigger boards, locked mirrors, a timer, and a move limit.'
    : 'Each level is harder than the one before it.';
  $('#page-label').textContent = `Levels ${from + 1}–${to} of ${count}`;
  $('#page-prev').disabled = levelPage === 0;
  $('#page-next').disabled = levelPage >= pages - 1;
  document.querySelector('.pager').hidden = pages === 1;

  const grid = $('#level-grid');
  grid.innerHTML = '';
  for (let i = from; i < to; i++) {
    const locked = i + 1 > (progress.unlocked[menuMode] || 1);
    const stars = progress.best[`${menuMode}-${i}`] || 0;
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    btn.type = 'button';
    btn.disabled = locked;
    btn.setAttribute('aria-label', `Level ${i + 1}${locked ? ', locked' : stars ? `, best ${stars} stars` : ''}`);
    if (locked) {
      btn.innerHTML = `<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
    } else {
      btn.innerHTML = `<span>${i + 1}</span><span class="level-stars">${[1, 2, 3].map((s) => starSvg(s <= stars)).join('')}</span>`;
    }
    btn.addEventListener('click', () => {
      audio.ui();
      startLevel(menuMode, i);
    });
    grid.appendChild(btn);
  }
}

$('#page-prev').addEventListener('click', () => { levelPage--; audio.whoosh(); renderLevels(); });
$('#page-next').addEventListener('click', () => { levelPage++; audio.whoosh(); renderLevels(); });

function fmtTime(sec) {
  const m = Math.ceil(sec);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

let lastTimer = '';
function renderTimer() {
  const txt = fmtTime(state.timeLeft);
  if (txt !== lastTimer) {
    lastTimer = txt;
    $('#hud-timer').textContent = txt;
    $('#hud-timer-wrap').classList.toggle('warn', state.timeLeft < 20);
  }
}

function updateHud() {
  $('#hud-level').textContent = `${state.hard ? 'Hard' : 'Level'} ${state.idx + 1} / ${state.count}`;
  $('#hud-moves').textContent = String(state.moves);
  $('#hud-limit').textContent = state.hard ? `of ${state.limit}` : `par ${cur.optimal}`;
  $('#hud-timer-wrap').hidden = !state.hard;
  renderTimer();
}

function showResult({ won, stars = 0, title, text, hasNext }) {
  $('#result-title').textContent = title;
  $('#result-text').textContent = text;
  document.querySelectorAll('#result-stars .star').forEach((s, i) => s.classList.toggle('on', won && i < stars));
  $('#btn-next').hidden = !(won && hasNext);
  $('#btn-retry').textContent = won ? 'Replay' : 'Try again';
  modal.hidden = false;
  audio.open();
  if ($('#btn-next').hidden) $('#btn-retry').focus();
  else $('#btn-next').focus();
}

/* ---------- wiring (runs regardless of the view) ---------- */
document.querySelectorAll('[data-goto]').forEach((b) => {
  b.addEventListener('click', () => {
    audio.ui();
    showPanel(b.dataset.goto);
  });
});
document.querySelectorAll('[data-action]').forEach((b) => {
  b.addEventListener('click', () => {
    audio.ui();
    openLevels(b.dataset.action);
  });
});

$('#btn-next').addEventListener('click', () => {
  modal.hidden = true;
  audio.ui();
  startLevel(state.mode, state.idx + 1);
});
$('#btn-retry').addEventListener('click', () => {
  modal.hidden = true;
  audio.ui();
  restartLevel();
});
$('#btn-levels').addEventListener('click', () => {
  modal.hidden = true;
  openLevels(state.mode);
});

$('#btn-reset').addEventListener('click', () => { audio.click(); restartLevel(); });
$('#btn-menu').addEventListener('click', () => {
  audio.ui();
  state.status = 'idle';
  audio.setHum(false);
  showPanel('menu');
});

const muteBtn = $('#btn-mute');
function syncMute(m) {
  muteBtn.setAttribute('aria-pressed', String(m));
  muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
}
syncMute(audio.prefs().muted);
muteBtn.addEventListener('click', () => syncMute(audio.toggleMute()));

function syncSettings() {
  const p = audio.prefs();
  $('#vol-master').value = p.master;
  $('#vol-sfx').value = p.sfx;
  $('#vol-music').value = p.music;
}
['master', 'sfx', 'music'].forEach((k) => {
  $(`#vol-${k}`).addEventListener('input', (e) => audio.setVolumes({ [k]: parseFloat(e.target.value) }));
});

let resetArmed = false;
$('#btn-reset-progress').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!resetArmed) {
    resetArmed = true;
    b.textContent = 'Tap again to erase';
    setTimeout(() => { resetArmed = false; b.textContent = 'Reset progress'; }, 3000);
    return;
  }
  resetArmed = false;
  progress = { unlocked: { campaign: 1, hard: 1 }, best: {} };
  saveProgress();
  b.textContent = 'Progress erased';
  toast('Saved progress erased.');
});

// Board input: pointer events on the stage, so they work for either view.
let downAt = null;
stage.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
stage.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
  if (state.status !== 'playing') return;
  const cell = view.pick(e);
  if (!cell || cell.type !== T.MIRROR) return;
  if (cell.locked) {
    audio.denied();
    toast('This mirror is locked in place.');
    return;
  }
  rotateCell(cell);
});
stage.addEventListener('pointermove', (e) => {
  if (state.status !== 'playing') return;
  const cell = view.pick(e);
  stage.style.cursor = cell && cell.type === T.MIRROR && !cell.locked ? 'pointer' : 'default';
});

// Hover tick on interactive controls (mouse only).
let hoverEl = null;
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest && e.target.closest('.btn, .level-btn, .icon-btn, .pager-btn');
  if (el && el !== hoverEl && !el.disabled) audio.hover();
  hoverEl = el;
});

// First gesture unlocks audio (browsers block sound before a click or key press).
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

window.addEventListener('resize', () => {
  view.resize();
  if (cur) view.fit(cur.n);
});

/* ---------- loop ---------- */
let last = performance.now();
let lastSec = -1;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;
  view.tick(dt, state.status === 'won');

  if (state.status === 'playing' && state.hard) {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    renderTimer();
    const sec = Math.ceil(state.timeLeft);
    if (sec !== lastSec && sec <= 10 && sec > 0) audio.tick(sec <= 3);
    lastSec = sec;
    if (state.timeLeft <= 0) lose('time');
  }
  requestAnimationFrame(loop);
}

// Background board on the menu.
function preview() {
  cur = generateLevel(levelConfig('campaign', 5));
  state.status = 'idle';
  view.build(cur);
  mirrorCells = collectMirrors(cur);
  view.fit(cur.n);
  rebuildBeam(false);
}

preview();
showPanel('menu');
requestAnimationFrame(loop);
