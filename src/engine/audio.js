import { MUSIC_TRACKS, GOOD_LIFE_URL, EMOTES } from './constants.js';

let _audioCtx = null;
export function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!_audioCtx) _audioCtx = new Ctx();
  if (_audioCtx.state === 'suspended') {
    try {
      _audioCtx.resume();
    } catch (e) {}
  }
  return _audioCtx;
}

function tone(ctx, dest, freq, start, dur, type, vol = 1) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.9 * vol, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noiseBurst(ctx, dest, start, dur) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(dest);
  src.start(start);
}

function nt(ctx, dest, midi, start, dur, type = 'triangle', vol = 1) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  tone(ctx, dest, freq, start, dur, type, vol);
}

function sweep(ctx, dest, f0, f1, start, dur, type = 'sawtooth', vol = 1) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.9 * vol, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

const SOUND_LIB = {
  click(ctx, m, t) {
    nt(ctx, m, 72, t, 0.05, 'triangle', 1);
    nt(ctx, m, 79, t + 0.045, 0.06, 'triangle', 0.85);
  },
  play(ctx, m, t) {
    sweep(ctx, m, 300, 900, t, 0.08, 'square', 0.9);
    noiseBurst(ctx, m, t, 0.05);
    nt(ctx, m, 81, t + 0.02, 0.05, 'triangle', 0.5);
  },
  draw(ctx, m, t) {
    sweep(ctx, m, 620, 200, t, 0.15, 'sawtooth', 0.8);
  },
  wild(ctx, m, t) {
    [72, 76, 79, 84].forEach((f, i) => nt(ctx, m, f, t + i * 0.06, 0.12, 'triangle', 0.85));
  },
  skip(ctx, m, t) {
    nt(ctx, m, 84, t, 0.09, 'square', 0.8);
    nt(ctx, m, 79, t + 0.09, 0.09, 'square', 0.8);
    nt(ctx, m, 74, t + 0.18, 0.12, 'square', 0.8);
  },
  reverse(ctx, m, t) {
    nt(ctx, m, 64, t, 0.1, 'triangle', 0.9);
    nt(ctx, m, 71, t + 0.09, 0.1, 'triangle', 0.9);
    nt(ctx, m, 79, t + 0.18, 0.14, 'triangle', 0.9);
  },
  shuffle(ctx, m, t) {
    noiseBurst(ctx, m, t, 0.1);
    noiseBurst(ctx, m, t + 0.1, 0.12);
    noiseBurst(ctx, m, t + 0.22, 0.14);
    sweep(ctx, m, 240, 720, t, 0.3, 'triangle', 0.6);
  },
  win(ctx, m, t) {
    [72, 76, 79, 84, 88, 91].forEach((f, i) => nt(ctx, m, f, t + i * 0.1, 0.18, 'square', 0.9));
    nt(ctx, m, 96, t + 0.6, 0.4, 'triangle', 0.9);
  },
  lose(ctx, m, t) {
    nt(ctx, m, 74, t, 0.18, 'sawtooth', 0.7);
    nt(ctx, m, 71, t + 0.16, 0.18, 'sawtooth', 0.7);
    nt(ctx, m, 67, t + 0.32, 0.18, 'sawtooth', 0.7);
  },
  uno(ctx, m, t) {
    nt(ctx, m, 72, t, 0.08, 'square', 0.9);
    nt(ctx, m, 72, t + 0.12, 0.08, 'square', 0.9);
    nt(ctx, m, 72, t + 0.24, 0.08, 'square', 0.9);
    nt(ctx, m, 84, t + 0.3, 0.22, 'triangle', 0.9);
  },
  action(ctx, m, t) {
    sweep(ctx, m, 200, 700, t, 0.14, 'square', 0.9);
    nt(ctx, m, 84, t + 0.1, 0.1, 'triangle', 0.8);
  }
};

const EMOTE_SOUNDS = {
  cheer(ctx, m, t) {
    nt(ctx, m, 67, t, 0.1, 'square', 0.8);
    nt(ctx, m, 72, t + 0.1, 0.1, 'square', 0.8);
    nt(ctx, m, 76, t + 0.2, 0.16, 'square', 0.8);
  },
  laugh(ctx, m, t) {
    nt(ctx, m, 74, t, 0.09, 'square', 0.7);
    nt(ctx, m, 77, t + 0.11, 0.09, 'square', 0.7);
    nt(ctx, m, 81, t + 0.22, 0.09, 'square', 0.7);
  },
  cool(ctx, m, t) {
    nt(ctx, m, 62, t, 0.12, 'triangle', 0.8);
    nt(ctx, m, 69, t + 0.08, 0.12, 'triangle', 0.8);
  },
  party(ctx, m, t) {
    [60, 64, 67, 72, 76, 79].forEach((f, i) => nt(ctx, m, f, t + i * 0.05, 0.09, 'square', 0.8));
  },
  shock(ctx, m, t) {
    sweep(ctx, m, 500, 1100, t, 0.14, 'sawtooth', 0.9);
    nt(ctx, m, 86, t + 0.02, 0.12, 'triangle', 0.9);
  },
  angry(ctx, m, t) {
    sweep(ctx, m, 400, 120, t, 0.3, 'sawtooth', 0.9);
    nt(ctx, m, 45, t, 0.2, 'square', 0.8);
  },
  sad(ctx, m, t) {
    nt(ctx, m, 69, t, 0.14, 'sawtooth', 0.7);
    nt(ctx, m, 65, t + 0.14, 0.14, 'sawtooth', 0.7);
    nt(ctx, m, 60, t + 0.28, 0.22, 'sawtooth', 0.7);
  },
  fire(ctx, m, t) {
    noiseBurst(ctx, m, t, 0.2);
    sweep(ctx, m, 120, 500, t, 0.25, 'sawtooth', 0.8);
  },
  applause(ctx, m, t) {
    for (let i = 0; i < 4; i += 1) noiseBurst(ctx, m, t + i * 0.12, 0.06);
  },
  love(ctx, m, t) {
    nt(ctx, m, 72, t, 0.1, 'triangle', 0.9);
    nt(ctx, m, 76, t + 0.1, 0.1, 'triangle', 0.9);
    nt(ctx, m, 79, t + 0.2, 0.2, 'triangle', 0.9);
  },
  fanfare(ctx, m, t) {
    [72, 79, 84, 91].forEach((f, i) => nt(ctx, m, f, t + i * 0.07, 0.14, 'square', 0.9));
  },
  power(ctx, m, t) {
    sweep(ctx, m, 100, 800, t, 0.2, 'square', 0.9);
    nt(ctx, m, 60, t, 0.16, 'triangle', 0.8);
  },
  thinking(ctx, m, t) {
    nt(ctx, m, 67, t, 0.08, 'triangle', 0.7);
    nt(ctx, m, 67, t + 0.18, 0.08, 'triangle', 0.7);
    nt(ctx, m, 74, t + 0.3, 0.12, 'triangle', 0.7);
  }
};

export const soundNames = Object.keys(SOUND_LIB);
export const emoteSoundNames = Object.keys(EMOTE_SOUNDS);

export function playSound(name) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const fn = SOUND_LIB[name];
  if (!fn) return;
  const master = ctx.createGain();
  master.gain.value = 0.09;
  master.connect(ctx.destination);
  try {
    fn(ctx, master, ctx.currentTime);
  } catch (e) {}
}

export function playEmoteSound(name) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const fn = EMOTE_SOUNDS[name];
  if (!fn) return;
  const master = ctx.createGain();
  master.gain.value = 0.08;
  master.connect(ctx.destination);
  try {
    fn(ctx, master, ctx.currentTime);
  } catch (e) {}
}

export function emoteSoundOf(emote) {
  const found = EMOTES.find((x) => x.e === emote);
  return found ? found.s : 'click';
}

export const MusicEngine = {
  ctx: null,
  master: null,
  timer: null,
  kind: null,
  pending: null,
  running: false,
  step: 0,
  nextTime: 0,
  seed: 1,
  melody: [],
  volume: 1,

  enabled() {
    return this.musicEnabled !== false;
  },

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.05 * this.volume;
    this.master.connect(this.ctx.destination);
  },

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = 0.05 * v;
  },

  request(kind) {
    this.pending = kind;
    if (!this.enabled()) return;
    this.tryStart();
  },

  tryStart() {
    if (!this.enabled() || !this.pending) return;
    this.init();
    if (!this.ctx || !this.master) return;
    if (this.ctx.state === 'suspended') {
      try {
        this.ctx.resume();
      } catch (e) {}
    }
    if (this.running && this.kind === this.pending) return;
    const t = MUSIC_TRACKS[this.pending];
    if (!t) return;
    this.stop();
    this.kind = this.pending;
    this.step = 0;
    this.seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.melody = this.genMelody(t);
    this.running = true;
    this.timer = setInterval(() => this.tick(), 80);
  },

  stop() {
    this.running = false;
    this.kind = null;
    clearInterval(this.timer);
    this.timer = null;
  },

  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  },

  genMelody(t) {
    const m = [];
    for (let i = 0; i < 64; i += 1) {
      const root = t.chords[i % t.chords.length][0];
      const deg = t.leadDeg[Math.floor(this.rand() * t.leadDeg.length)];
      m.push(root + deg + 24);
    }
    return m;
  },

  speedMult(playerCount, hasWinner) {
    if (this.kind !== 'gameplay') return 1;
    const n = playerCount;
    if (hasWinner || n <= 0) return 1;
    if (n <= 2) return 1.25;
    if (n <= 3) return 1.12;
    return 1;
  },

  tick() {
    const t = MUSIC_TRACKS[this.kind];
    if (!t || !this.running || !this.ctx) return;
    const spb = 60 / t.tempo;
    const dt = spb / 2;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      this.playStep(this.step, this.nextTime, dt, t);
      this.step = (this.step + 1) % (t.chords.length * 8);
      this.nextTime += dt;
    }
  },

  playStep(step, time, dt, t) {
    const bar = Math.floor(step / 8) % t.chords.length;
    const s = step % 8;
    const root = t.chords[bar][0];
    const ivs = t.chords[bar][1];
    if (s === 2 || s === 6) this.hat(time, dt * 0.4, 0.5);
    if (s === 0) this.note(root - 12, time, dt * 1.9, 'triangle', 1.0);
    if (s === 4) this.note(root + ivs[1] - 12, time, dt * 1.9, 'triangle', 0.85);
    const arp = [0, 1, 2, 1, 2, 3, 2, 1];
    this.note(root + ivs[arp[s]] + 12, time, dt * 0.9, 'square', 0.32);
    if (s % 2 === 0) {
      const li = Math.floor(step / 2) % this.melody.length;
      this.note(this.melody[li], time, dt * 1.9, 'triangle', 0.5);
    }
  },

  hat(time, dur, vol) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.value = 0.16 * vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(time);
  },

  note(midi, time, dur, type, gain) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    const peak = 0.28 * gain;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }
};

export class GoodLifePlayer {
  constructor() {
    this.audio = null;
    this.kind = null;
    this.enabledFlag = false;
    this.volume = 0.6;
    this.onEnded = null;
  }

  get enabled() {
    return this.enabledFlag;
  }

  setEnabled(v) {
    this.enabledFlag = !!v;
    if (!v) this.stop();
    else if (this.kind) this.request(this.kind);
  }

  setVolume(v) {
    this.volume = v;
    if (this.audio) this.audio.volume = v;
  }

  request(kind) {
    this.kind = kind;
    if (!this.enabledFlag) return;
    this.ensure();
    if (!this.audio) return;
    if (this.audio.src && this.audio.dataset.kind === kind) {
      this.audio.play().catch(() => {});
      return;
    }
    this.audio.src = GOOD_LIFE_URL;
    this.audio.dataset.kind = kind;
    this.audio.loop = true;
    this.audio.volume = this.volume;
    this.audio.play().catch(() => {});
  }

  ensure() {
    if (this.audio) return;
    this.audio = document.createElement('audio');
    this.audio.preload = 'auto';
  }

  stop() {
    this.kind = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }
  }
}