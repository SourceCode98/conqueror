/**
 * Retro chiptune music engine — no audio files required.
 * Web Audio API synthesis inspired by NES / Game Boy era.
 *
 * Channels per track:
 *   Lead     — square wave, composed melody with vibrato
 *   Harmony  — square wave, counter-melody
 *   Arp      — square wave, 16th-note chord arpeggios
 *   Bass     — triangle wave, walking root + fifth
 *   Drums    — noise envelopes (kick / snare / hi-hat)
 */

// ── Frequency table ───────────────────────────────────────────────────────────
const N: Record<string, number> = {
  F2:  87.31,  G2:  98.00,  A2: 110.00, Bb2: 116.54, B2: 123.47,
  C3: 130.81,  D3: 146.83,  E3: 164.81,  F3: 174.61,  Fs3: 185.00, G3: 196.00, Gs3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63,  D4: 293.66,  E4: 329.63,  F4: 349.23,  Fs4: 369.99, G4: 392.00, Gs4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25,  D5: 587.33,  E5: 659.25,  F5: 698.46,  G5: 783.99,  A5: 880.00,
};

// ── Track definitions ─────────────────────────────────────────────────────────

interface BarDef {
  arp:   number[];    // 4 chord tones for arpeggiator rotation
  bassR: number;      // bass root frequency
  bass5: number;      // bass fifth frequency
}

interface TrackDef {
  name:    string;
  bpm:     number;
  arpDiv:  1 | 2;                    // 1 = every 16th, 2 = every 8th
  bars:    BarDef[];                 // 4 bars
  melody:  Array<number | null>;     // 64 slots (4 bars × 16 sixteenths)
  harmony: Array<number | null>;     // 64 slots
}

// ─────────────────────────────────────────────────────────────────────────────
// Track 1 — "Conquest"   Am F C G   132 BPM   energetic adventure
// ─────────────────────────────────────────────────────────────────────────────
const CONQUEST: TrackDef = {
  name: 'Conquest', bpm: 132, arpDiv: 1,
  bars: [
    { arp: [N.A3, N.C4, N.E4, N.A4], bassR: N.A2, bass5: N.E3 },  // Am
    { arp: [N.F3, N.A3, N.C4, N.F4], bassR: N.F2, bass5: N.C3 },  // F
    { arp: [N.C3, N.E4, N.G4, N.C5], bassR: N.C3, bass5: N.G3 },  // C
    { arp: [N.G3, N.B3, N.D4, N.G4], bassR: N.G2, bass5: N.D3 },  // G
  ],
  melody: [
    N.A4,  null,  N.C5,  null,  N.E4,  null,  N.D4,  null,
    N.E4,  N.D4,  N.C5,  null,  N.A4,  null,  null,  null,
    N.F4,  null,  N.A4,  null,  null,  N.G4,  null,  N.F4,
    N.E4,  null,  N.D4,  null,  N.C5,  null,  null,  null,
    N.G4,  null,  N.E4,  null,  N.G4,  null,  N.E4,  null,
    N.C5,  null,  null,  N.B4,  null,  N.A4,  null,  null,
    N.B4,  null,  N.D5,  null,  N.B4,  null,  N.G4,  null,
    N.A4,  null,  N.G4,  null,  N.E4,  null,  N.D4,  null,
  ],
  harmony: [
    N.E4,  null,  null,  null,  N.A3,  null,  null,  null,
    N.C4,  null,  null,  null,  N.E4,  null,  null,  null,
    N.C4,  null,  null,  null,  N.F3,  null,  null,  null,
    N.A3,  null,  null,  null,  N.G4,  null,  null,  null,
    N.E4,  null,  null,  null,  N.C4,  null,  null,  null,
    N.G4,  null,  null,  null,  N.E4,  null,  null,  null,
    N.D4,  null,  null,  null,  N.G3,  null,  null,  null,
    N.B3,  null,  null,  null,  N.D4,  null,  null,  null,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Track 2 — "Village"   C G Am F   100 BPM   peaceful, pastoral
// ─────────────────────────────────────────────────────────────────────────────
const VILLAGE: TrackDef = {
  name: 'Village', bpm: 100, arpDiv: 2,
  bars: [
    { arp: [N.C4, N.E4, N.G4, N.C5], bassR: N.C3, bass5: N.G3 },  // C
    { arp: [N.G3, N.B3, N.D4, N.G4], bassR: N.G2, bass5: N.D3 },  // G
    { arp: [N.A3, N.C4, N.E4, N.A4], bassR: N.A2, bass5: N.E3 },  // Am
    { arp: [N.F3, N.A3, N.C4, N.F4], bassR: N.F2, bass5: N.C3 },  // F
  ],
  melody: [
    N.E5,  null,  null,  N.C5,  null,  null,  N.G4,  null,
    null,  N.E5,  null,  N.C5,  null,  null,  null,  null,
    N.D5,  null,  N.B4,  null,  null,  null,  N.G4,  null,
    null,  N.B4,  null,  N.D5,  null,  null,  null,  null,
    N.C5,  null,  N.A4,  null,  null,  null,  N.E4,  null,
    null,  N.A4,  null,  N.C5,  null,  null,  null,  null,
    N.A4,  null,  N.F4,  null,  null,  null,  N.C5,  null,
    null,  N.A4,  null,  N.G4,  null,  N.F4,  null,  null,
  ],
  harmony: [
    N.C4,  null,  null,  null,  N.E4,  null,  null,  null,
    N.G4,  null,  null,  null,  N.C4,  null,  null,  null,
    N.B3,  null,  null,  null,  N.D4,  null,  null,  null,
    N.G4,  null,  null,  null,  N.B3,  null,  null,  null,
    N.E4,  null,  null,  null,  N.A3,  null,  null,  null,
    N.C4,  null,  null,  null,  N.E4,  null,  null,  null,
    N.F3,  null,  null,  null,  N.A3,  null,  null,  null,
    N.C4,  null,  null,  null,  N.A3,  null,  null,  null,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Track 3 — "Dungeon"   Am Dm E Am   96 BPM   dark, mysterious
// ─────────────────────────────────────────────────────────────────────────────
const DUNGEON: TrackDef = {
  name: 'Dungeon', bpm: 96, arpDiv: 2,
  bars: [
    { arp: [N.A3, N.C4, N.E4, N.A4],  bassR: N.A2, bass5: N.E3  },  // Am
    { arp: [N.D3, N.F3, N.A3, N.D4],  bassR: N.D3, bass5: N.A3  },  // Dm
    { arp: [N.E3, N.Gs3, N.B3, N.E4], bassR: N.E3, bass5: N.B3  },  // E  (major — tension)
    { arp: [N.A3, N.C4, N.E4, N.A4],  bassR: N.A2, bass5: N.E3  },  // Am (resolve)
  ],
  melody: [
    null,  null,  N.A4,  null,  null,  N.C5,  null,  null,
    N.E4,  null,  null,  null,  N.A4,  null,  null,  null,
    null,  null,  N.D4,  null,  null,  N.F4,  null,  null,
    N.A4,  null,  null,  null,  N.Bb4, null,  N.A4,  null,
    null,  null,  N.E4,  null,  N.Gs4, null,  N.E4,  null,
    N.B4,  null,  null,  null,  null,  null,  N.E5,  null,
    null,  N.A4,  null,  N.E4,  null,  N.C4,  null,  null,
    null,  null,  N.A4,  null,  null,  null,  null,  null,
  ],
  harmony: [
    N.E4,  null,  null,  null,  N.A3,  null,  null,  null,
    N.C4,  null,  null,  null,  null,  null,  null,  null,
    N.F3,  null,  null,  null,  N.D4,  null,  null,  null,
    N.A3,  null,  null,  null,  null,  null,  null,  null,
    N.Gs3, null,  null,  null,  N.E4,  null,  null,  null,
    N.B3,  null,  null,  null,  null,  null,  null,  null,
    N.E3,  null,  null,  null,  N.A3,  null,  null,  null,
    N.C4,  null,  null,  null,  null,  null,  null,  null,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Track 4 — "Battle"   Em C G D   152 BPM   intense, fast-paced
// ─────────────────────────────────────────────────────────────────────────────
const BATTLE: TrackDef = {
  name: 'Battle', bpm: 152, arpDiv: 1,
  bars: [
    { arp: [N.E3, N.G3, N.B3, N.E4], bassR: N.E3, bass5: N.B3 },  // Em
    { arp: [N.C3, N.E4, N.G4, N.C5], bassR: N.C3, bass5: N.G3 },  // C
    { arp: [N.G3, N.B3, N.D4, N.G4], bassR: N.G2, bass5: N.D3 },  // G
    { arp: [N.D3, N.Fs3,N.A3, N.D4], bassR: N.D3, bass5: N.A3 },  // D
  ],
  melody: [
    N.E4,  N.G4,  N.A4,  N.B4,  N.A4,  N.G4,  N.E4,  N.G4,
    N.A4,  N.B4,  N.D5,  N.B4,  N.A4,  N.G4,  N.E4,  null,
    N.E4,  N.G4,  N.E4,  N.C5,  N.B4,  N.A4,  N.G4,  N.E4,
    N.C5,  N.B4,  N.A4,  N.G4,  N.E4,  null,  null,  null,
    N.G4,  N.A4,  N.B4,  N.A4,  N.G4,  N.E4,  N.G4,  N.A4,
    N.B4,  N.D5,  N.B4,  N.A4,  N.G4,  null,  N.G4,  null,
    N.D5,  null,  N.B4,  N.A4,  N.G4,  N.E4,  null,  N.G4,
    N.A4,  N.B4,  null,  N.A4,  N.G4,  null,  N.E4,  null,
  ],
  harmony: [
    N.B3,  null,  null,  N.E4,  null,  null,  N.B3,  null,
    null,  N.E4,  null,  null,  N.G4,  null,  null,  null,
    N.G3,  null,  null,  N.C4,  null,  null,  N.G3,  null,
    null,  N.C4,  null,  null,  N.E4,  null,  null,  null,
    N.D4,  null,  null,  N.G4,  null,  null,  N.D4,  null,
    null,  N.G4,  null,  null,  N.B4,  null,  null,  null,
    N.Fs4, null,  null,  N.D4,  null,  null,  N.Fs4, null,
    null,  N.D4,  null,  null,  N.A4,  null,  null,  null,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Track 5 — "Tavern"   G C D G   118 BPM   bouncy, folk-like
// ─────────────────────────────────────────────────────────────────────────────
const TAVERN: TrackDef = {
  name: 'Tavern', bpm: 118, arpDiv: 1,
  bars: [
    { arp: [N.G3, N.B3, N.D4, N.G4], bassR: N.G2, bass5: N.D3 },   // G
    { arp: [N.C3, N.E4, N.G4, N.C5], bassR: N.C3, bass5: N.G3 },   // C
    { arp: [N.D3, N.Fs3,N.A3, N.D4], bassR: N.D3, bass5: N.A3 },   // D
    { arp: [N.G3, N.B3, N.D4, N.G4], bassR: N.G2, bass5: N.D3 },   // G
  ],
  melody: [
    N.G4,  null,  N.B4,  null,  N.D5,  null,  N.B4,  null,
    N.G5,  null,  null,  null,  N.B4,  null,  N.A4,  null,
    N.G4,  null,  N.E4,  null,  N.C5,  null,  N.E4,  null,
    N.D5,  null,  N.C5,  null,  N.B4,  null,  null,  null,
    N.Fs4, null,  N.A4,  null,  N.D5,  null,  N.A4,  null,
    N.B4,  null,  N.A4,  null,  N.Fs4, null,  null,  null,
    N.G4,  null,  N.A4,  null,  N.B4,  null,  N.D5,  null,
    N.G5,  null,  N.D5,  null,  N.B4,  null,  N.G4,  null,
  ],
  harmony: [
    N.D4,  null,  null,  null,  N.G4,  null,  null,  null,
    N.B4,  null,  null,  null,  N.D4,  null,  null,  null,
    N.E4,  null,  null,  null,  N.C4,  null,  null,  null,
    N.G4,  null,  null,  null,  N.E4,  null,  null,  null,
    N.D4,  null,  null,  null,  N.Fs4, null,  null,  null,
    N.A4,  null,  null,  null,  N.D4,  null,  null,  null,
    N.B3,  null,  null,  null,  N.D4,  null,  null,  null,
    N.G4,  null,  null,  null,  N.B4,  null,  null,  null,
  ],
};

export const TRACKS: TrackDef[] = [CONQUEST, VILLAGE, DUNGEON, BATTLE, TAVERN];

// ── Engine ────────────────────────────────────────────────────────────────────
class MusicEngine {
  private ctx:        AudioContext    | null = null;
  private masterGain: GainNode        | null = null;
  private hpFilter:   BiquadFilterNode| null = null;
  private vol      = 0.5;
  private running  = false;

  private tickTimer : ReturnType<typeof setInterval> | null = null;
  private nextTime  = 0;
  private nextStep  = 0;

  private _trackIdx     = 0;
  private _pendingTrack : number | null = null;
  private _noiseBuf     : AudioBuffer | null = null;
  private _tempoMult    = 1.0;  // 1.0 = normal, >1 = faster

  get isRunning()    { return this.running; }
  get trackIndex()   { return this._trackIdx; }

  /** Scale playback tempo. Applied on the next scheduled step. */
  setTempoMultiplier(mult: number) {
    this._tempoMult = Math.max(0.5, Math.min(2.0, mult));
  }

  setVolume(v: number) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.vol, this.ctx!.currentTime, 0.3);
    }
  }

  /** Switch to a different track. Snaps cleanly at next bar boundary. */
  setTrack(idx: number) {
    if (idx === this._trackIdx && this._pendingTrack === null) return;
    if (!this.running) { this._trackIdx = idx; return; }
    this._pendingTrack = idx;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(this.vol, this.ctx.currentTime + 0.8);
    this.masterGain.connect(this.ctx.destination);

    this.hpFilter = this.ctx.createBiquadFilter();
    this.hpFilter.type = 'highpass';
    this.hpFilter.frequency.value = 40;
    this.hpFilter.connect(this.masterGain);

    this.nextTime = this.ctx.currentTime + 0.05;
    this.nextStep = 0;
    this.tickTimer = setInterval(() => this.tick(), 22);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
  }

  // ── Scheduler ───────────────────────────────────────────────────────────────
  private tick() {
    if (!this.ctx || !this.running) return;
    const now = this.ctx.currentTime;
    while (this.nextTime < now + 0.28) {
      // Apply pending track switch at bar boundary (step 0)
      if (this.nextStep === 0 && this._pendingTrack !== null) {
        this._trackIdx    = this._pendingTrack;
        this._pendingTrack = null;
      }
      this.scheduleStep(this.nextStep, this.nextTime);
      this.nextTime += 60 / (TRACKS[this._trackIdx].bpm * this._tempoMult) / 4;
      this.nextStep  = (this.nextStep + 1) % 64;
    }
  }

  private scheduleStep(step: number, t: number) {
    const track   = TRACKS[this._trackIdx];
    const effBpm  = track.bpm * this._tempoMult;
    const barIdx  = Math.floor(step / 16) % 4;
    const beat    = Math.floor((step % 16) / 4);
    const sixInBt = step % 4;
    const bar     = track.bars[barIdx];

    // Drums
    if (beat === 0 && sixInBt === 0) this.kick(t);
    if (beat === 1 && sixInBt === 0) this.snare(t);
    if (beat === 2 && sixInBt === 0) this.kick(t);
    if (beat === 3 && sixInBt === 0) this.snare(t);
    if (sixInBt === 0 || sixInBt === 2) this.hihat(t);

    // Bass on beat downbeats
    if (sixInBt === 0) {
      const bFreq = (beat === 0 || beat === 2) ? bar.bassR : bar.bass5;
      this.bass(bFreq, t, (60 / effBpm) * 0.88);
    }

    // Arp (every 16th or every 8th depending on track)
    if (track.arpDiv === 1 || sixInBt % 2 === 0) {
      this.arp(bar.arp[step % 4], t, (60 / effBpm / 4) * 0.55);
    }

    // Lead melody
    const s16 = 60 / effBpm / 4;
    const leadFreq = track.melody[step];
    if (leadFreq) {
      const nextTied = track.melody[(step + 1) % 64] !== null;
      this.lead(leadFreq, t, nextTied ? s16 * 1.9 : s16 * 0.72);
    }

    // Harmony
    const harmFreq = track.harmony[step];
    if (harmFreq) this.harmony(harmFreq, t, s16 * 0.65);
  }

  // ── Synth helpers ────────────────────────────────────────────────────────────

  private out(): AudioNode {
    return this.hpFilter ?? this.masterGain ?? this.ctx!.destination;
  }

  private lead(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    // Vibrato
    const steps = Math.ceil(dur * 5.5);
    for (let i = 0; i <= steps; i++) {
      osc.frequency.setValueAtTime(freq + Math.sin(i / 5.5 * Math.PI * 2) * freq * 0.009, t + i / 5.5);
    }
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.19, t + 0.008);
    env.gain.setValueAtTime(0.14, t + 0.025);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env); env.connect(this.out());
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  private harmony(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.08, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env); env.connect(this.out());
    osc.start(t); osc.stop(t + dur + 0.01);
  }

  private arp(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    [0, 4].forEach(cents => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq * Math.pow(2, cents / 1200);
      env.gain.setValueAtTime(0.048, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(env); env.connect(this.out());
      osc.start(t); osc.stop(t + dur);
    });
  }

  private bass(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.30, t + 0.004);
    env.gain.setValueAtTime(0.24, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env); env.connect(this.out());
    osc.start(t); osc.stop(t + dur);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.06);
    env.gain.setValueAtTime(0.55, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(env); env.connect(this.out());
    osc.start(t); osc.stop(t + 0.13);
  }

  private snare(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    const hp  = ctx.createBiquadFilter();
    src.buffer = this.noiseBuf();
    hp.type = 'highpass'; hp.frequency.value = 1800;
    env.gain.setValueAtTime(0.28, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(hp); hp.connect(env); env.connect(this.out());
    src.start(t); src.stop(t + 0.15);
  }

  private hihat(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    const hp  = ctx.createBiquadFilter();
    src.buffer = this.noiseBuf();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    env.gain.setValueAtTime(0.06, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(hp); hp.connect(env); env.connect(this.out());
    src.start(t); src.stop(t + 0.04);
  }

  private noiseBuf(): AudioBuffer {
    if (this._noiseBuf) return this._noiseBuf;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }
}

export const musicEngine = new MusicEngine();
