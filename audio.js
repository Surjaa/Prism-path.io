// audio.js: every sound is synthesized with the Web Audio API. No audio files.

const KEY = 'prismpath.audio';
const defaults = { master: 0.8, sfx: 0.9, music: 0.35, muted: false };
let prefs = { ...defaults };
try {
  prefs = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch (_) { /* storage blocked: use defaults */ }

let ctx = null;
let out = null, sfxBus = null, musicBus = null, noiseBuf = null;
let humOsc = null, humGain = null, ambient = null;

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) { /* ignore */ }
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch (_) { return null; }

  out = ctx.createGain();
  out.gain.value = prefs.muted ? 0 : prefs.master;
  out.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = prefs.sfx;
  sfxBus.connect(out);

  musicBus = ctx.createGain();
  musicBus.gain.value = prefs.music;
  musicBus.connect(out);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function tone({ freq, end = null, dur = 0.2, type = 'sine', vol = 0.2, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.1, vol = 0.2, freq = 1500, q = 1, sweep = null, delay = 0 }) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export const audio = {
  // Call from a user gesture. Starts the context and the ambient drone.
  unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
    if (!ambient && !prefs.muted) this.startAmbient();
  },

  click() {
    tone({ freq: 1600, end: 900, dur: 0.06, type: 'triangle', vol: 0.18 });
    noise({ dur: 0.04, vol: 0.12, freq: 3000, q: 2 });
  },

  // Mirror flip: metallic clack followed by a short whoosh.
  rotate() {
    noise({ dur: 0.05, vol: 0.2, freq: 4200, q: 3 });
    tone({ freq: 2400, end: 1200, dur: 0.04, type: 'square', vol: 0.05 });
    noise({ dur: 0.16, vol: 0.14, freq: 900, q: 1.5, sweep: 3800, delay: 0.03 });
  },

  ui() {
    tone({ freq: 740, dur: 0.09, type: 'sine', vol: 0.12 });
  },

  hover() {
    tone({ freq: 1320, dur: 0.035, type: 'sine', vol: 0.05 });
  },

  open() {
    tone({ freq: 440, end: 880, dur: 0.18, type: 'triangle', vol: 0.1 });
  },

  whoosh() {
    noise({ dur: 0.35, vol: 0.12, freq: 400, q: 0.8, sweep: 2600 });
  },

  denied() {
    tone({ freq: 180, end: 140, dur: 0.18, type: 'square', vol: 0.1 });
    tone({ freq: 160, end: 120, dur: 0.18, type: 'square', vol: 0.1, delay: 0.2 });
  },

  warn() {
    tone({ freq: 600, end: 300, dur: 0.3, type: 'sawtooth', vol: 0.08 });
  },

  // Countdown tick. Urgent ticks are higher and louder.
  tick(urgent = false) {
    tone({ freq: urgent ? 1400 : 900, dur: 0.04, type: 'square', vol: urgent ? 0.08 : 0.04 });
  },

  // Beam travelling outward: one rising blip per segment.
  beamTravel(count, step = 0.09) {
    for (let i = 0; i < count; i++) {
      tone({ freq: 500 + i * 40, end: 900 + i * 40, dur: 0.07, type: 'sawtooth', vol: 0.025, delay: i * step });
    }
  },

  beam() {
    tone({ freq: 320, end: 1100, dur: 0.35, type: 'sawtooth', vol: 0.05 });
  },

  // Receptor locks on: low thunk and a bright shimmer.
  lock() {
    tone({ freq: 220, end: 110, dur: 0.25, type: 'sine', vol: 0.25 });
    noise({ dur: 0.2, vol: 0.2, freq: 900, q: 1 });
    tone({ freq: 1760, dur: 0.6, type: 'sine', vol: 0.08, delay: 0.12 });
    tone({ freq: 2637, dur: 0.5, type: 'sine', vol: 0.05, delay: 0.2 });
  },

  // One rising chime per star earned.
  star(n) {
    for (let i = 0; i < n; i++) {
      tone({ freq: 880 * (1 + i * 0.25), dur: 0.25, type: 'triangle', vol: 0.14, delay: i * 0.12 });
    }
  },

  // Every 100 levels: a bigger fanfare.
  milestone() {
    [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5].forEach((f, i) =>
      tone({ freq: f, dur: 0.45, type: 'triangle', vol: 0.16, delay: i * 0.09 })
    );
    tone({ freq: 261.63, dur: 1.2, type: 'sine', vol: 0.12, delay: 0.1 });
    noise({ dur: 1.0, vol: 0.1, freq: 3000, q: 0.6, sweep: 11000, delay: 0.5 });
  },

  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.18, delay: i * 0.11 })
    );
    noise({ dur: 0.6, vol: 0.08, freq: 6000, q: 0.7, sweep: 9000, delay: 0.35 });
  },

  fail() {
    tone({ freq: 220, end: 55, dur: 0.7, type: 'sawtooth', vol: 0.14 });
    noise({ dur: 0.5, vol: 0.1, freq: 400, q: 1 });
  },

  // Low hum while a beam is live.
  setHum(on) {
    if (!ctx && !on) return;
    const c = ensure();
    if (!c) return;
    if (on && !humOsc) {
      humOsc = c.createOscillator();
      humOsc.type = 'sine';
      humOsc.frequency.value = 180;
      humGain = c.createGain();
      humGain.gain.value = 0;
      humOsc.connect(humGain).connect(sfxBus);
      humOsc.start();
      humGain.gain.linearRampToValueAtTime(0.02, c.currentTime + 0.4);
    } else if (!on && humOsc) {
      humGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);
      const o = humOsc;
      setTimeout(() => { try { o.stop(); } catch (_) { /* already stopped */ } }, 400);
      humOsc = null;
      humGain = null;
    }
  },

  startAmbient() {
    const c = ensure();
    if (!c || ambient) return;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 0.5;
    const g = c.createGain();
    g.gain.value = 0.0001;
    filter.connect(g).connect(musicBus);

    const oscs = [[55, 0.5], [82.41, 0.3], [110, 0.12]].map(([f, v]) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const og = c.createGain();
      og.gain.value = v * 0.5;
      o.connect(og).connect(filter);
      o.start();
      return o;
    });

    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    g.gain.linearRampToValueAtTime(0.35, c.currentTime + 3);
    ambient = { oscs, lfo };
  },

  toggleMute() {
    prefs.muted = !prefs.muted;
    save();
    const c = ensure();
    if (out && c) out.gain.setTargetAtTime(prefs.muted ? 0 : prefs.master, c.currentTime, 0.05);
    if (!prefs.muted) this.unlock();
    return prefs.muted;
  },

  setVolumes(v) {
    Object.assign(prefs, v);
    save();
    if (out) out.gain.value = prefs.muted ? 0 : prefs.master;
    if (sfxBus) sfxBus.gain.value = prefs.sfx;
    if (musicBus) musicBus.gain.value = prefs.music;
  },

  prefs() {
    return { ...prefs };
  },
};
