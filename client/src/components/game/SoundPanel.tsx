/**
 * Sound panel: horn button (anti-spam) + mute toggle + music toggle.
 * Uses Web Audio API to generate simple sounds — no external audio files needed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { wsService } from '../../services/wsService.js';
import { useGameStore } from '../../store/gameStore.js';
import { useProfileStore } from '../../store/profileStore.js';
import { cn } from '../../lib/cn.js';
import { musicEngine } from './musicEngine.js';
import { VICTORY_POINTS_TO_WIN } from '@conqueror/shared';

const DEFAULT_HORN_COOLDOWN_MS = 30_000;

// ── Web Audio sound generators ───────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function playDiceSound() {
  try {
    const ctx = getAudioCtx();
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(200 + Math.random() * 400, ctx.currentTime + i * 0.04);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.04 + 0.08);
      osc.start(ctx.currentTime + i * 0.04);
      osc.stop(ctx.currentTime + i * 0.04 + 0.08);
    }
  } catch { /* ignore */ }
}

export function playPlaceSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* ignore */ }
}

export function playResourceSound() {
  try {
    const ctx = getAudioCtx();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
      osc.start(ctx.currentTime + i * 0.08);
      osc.stop(ctx.currentTime + i * 0.08 + 0.15);
    });
  } catch { /* ignore */ }
}

export function playHornSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.7);
  } catch { /* ignore */ }
}

function playFanfareHorn() {
  try {
    const ctx = getAudioCtx();
    [261, 329, 392, 523].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.2);
    });
  } catch { /* ignore */ }
}

function playRoyalHorn() {
  try {
    const ctx = getAudioCtx();
    const notes = [
      { freq: 392, t: 0,    dur: 0.15 },
      { freq: 523, t: 0.15, dur: 0.15 },
      { freq: 659, t: 0.3,  dur: 0.15 },
      { freq: 523, t: 0.45, dur: 0.1  },
      { freq: 784, t: 0.55, dur: 0.35 },
    ];
    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle'; osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.22, ctx.currentTime + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.t + n.dur);
      osc.start(ctx.currentTime + n.t);
      osc.stop(ctx.currentTime + n.t + n.dur);
    });
  } catch { /* ignore */ }
}

function playWarHorn() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.3);
    osc.frequency.setValueAtTime(110, ctx.currentTime + 0.35);
    osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.7);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.9);
  } catch { /* ignore */ }
}

export function playHornById(hornId: string) {
  switch (hornId) {
    case 'horn_fanfare': return playFanfareHorn();
    case 'horn_royal':   return playRoyalHorn();
    case 'horn_war':     return playWarHorn();
    default:             return playHornSound();
  }
}

export function playTradeSound() {
  try {
    const ctx = getAudioCtx();
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.18);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.18);
    });
  } catch { /* ignore */ }
}

// ── Sound context: global mute state ─────────────────────────────────────────
let globalMuted = false;

export function isSoundMuted() { return globalMuted; }
export function setGlobalMuted(v: boolean) { globalMuted = v; }

export function safePlay(fn: () => void) {
  if (!globalMuted) fn();
}

// ── Music track + tempo based on leading VP ───────────────────────────────────
// Tracks ordered by ascending BPM: VILLAGE(100) → TAVERN(118) → CONQUEST(132) → BATTLE(152)
// DUNGEON(96) excluded from auto-selection — its low BPM breaks the tension curve.

function vpToTrackIdx(ratio: number): number {
  if (ratio >= 0.75) return 3; // BATTLE   152 BPM — final sprint
  if (ratio >= 0.50) return 0; // CONQUEST 132 BPM — energetic mid
  if (ratio >= 0.25) return 4; // TAVERN   118 BPM — building up
  return 1;                    // VILLAGE  100 BPM — peaceful opening
}

/** Extra tempo multiplier: ramps from 1.0 at 75% VP to 1.18 at 100% VP */
function vpToTempoMult(ratio: number): number {
  if (ratio < 0.75) return 1.0;
  return 1.0 + (ratio - 0.75) / 0.25 * 0.18; // linear 1.0 → 1.18
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  gameId: string;
  className?: string;
}

export default function SoundPanel({ gameId, className }: Props) {
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);   // engine running
  const [panelOpen, setPanelOpen] = useState(false); // volume slider visible
  const [musicVol, setMusicVol] = useState(0.45);
  const [hornDisabled, setHornDisabled] = useState(false);
  const [hornCooldown, setHornCooldown] = useState(0);
  const [trackIdx, setTrackIdx] = useState(0);
  const { toasts, gameState } = useGameStore();
  const { profile } = useProfileStore();
  const selectedHorn = profile?.selectedHorn ?? 'horn_default';
  const hornCooldownMs = ((gameState?.hornCooldownSecs) ?? 30) * 1000;
  const musicAutoStarted = useRef(false);

  // Play SFX sounds when new toasts arrive
  const prevToastLen = useRef(toasts.length);
  useEffect(() => {
    if (toasts.length > prevToastLen.current) {
      const latest = toasts[toasts.length - 1];
      if (latest?.type === 'horn') safePlay(() => playHornById((latest.data?.hornId as string) ?? selectedHorn));
      if (latest?.type === 'dice_resources') safePlay(playResourceSound);
      if (latest?.type === 'bank_trade') safePlay(playTradeSound);
      if (latest?.type === 'action') {
        const action = latest.data?.action as string;
        if (action === 'builtRoad' || action === 'builtSettlement' || action === 'builtCity') {
          safePlay(playPlaceSound);
        }
      }
    }
    prevToastLen.current = toasts.length;
  }, [toasts]);

  // Auto-start music on first user interaction (browsers block audio before a gesture)
  useEffect(() => {
    if (!musicOn) return;
    const tryStart = async () => {
      if (musicAutoStarted.current || musicEngine.isRunning) return;
      musicAutoStarted.current = true;
      await musicEngine.start();
      musicEngine.setVolume(musicVol);
    };
    document.addEventListener('pointerdown', tryStart, { once: true });
    return () => document.removeEventListener('pointerdown', tryStart);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync music engine volume when slider changes
  useEffect(() => {
    musicEngine.setVolume(musicVol);
  }, [musicVol]);

  // Auto-select track + tempo based on leading player's VP ratio
  const leadingVPRatio = useMemo(() => {
    if (!gameState || gameState.phase === 'GAME_OVER') return 0;
    const maxVP = Math.max(...gameState.players.map(p => p.victoryPoints));
    return maxVP / VICTORY_POINTS_TO_WIN;
  }, [gameState]);

  useEffect(() => {
    if (!musicEngine.isRunning) return;
    const idx  = vpToTrackIdx(leadingVPRatio);
    const mult = vpToTempoMult(leadingVPRatio);
    if (idx !== trackIdx) {
      setTrackIdx(idx);
      musicEngine.setTrack(idx);
    }
    musicEngine.setTempoMultiplier(mult);
  // trackIdx intentionally excluded — we only want to react to VP changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadingVPRatio]);

  // 🎵 = toggle panel visibility only (never stops music)
  function togglePanel() {
    setPanelOpen(o => !o);
  }

  // 🔊/🔇 = toggle music engine on/off
  async function toggleMusic() {
    if (musicOn) {
      musicEngine.stop();
      setMusicOn(false);
    } else {
      await musicEngine.start();
      musicEngine.setVolume(musicVol);
      musicEngine.setTempoMultiplier(vpToTempoMult(leadingVPRatio));
      musicEngine.setTrack(vpToTrackIdx(leadingVPRatio));
      setMusicOn(true);
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setGlobalMuted(next);
  }

  function blowHorn() {
    if (hornDisabled) return;
    wsService.send({ type: 'HORN', payload: { gameId, hornId: selectedHorn } });
    safePlay(() => playHornById(selectedHorn));
    setHornDisabled(true);
    let remaining = hornCooldownMs / 1000;
    setHornCooldown(remaining);
    const iv = setInterval(() => {
      remaining -= 1;
      setHornCooldown(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        setHornDisabled(false);
        setHornCooldown(0);
      }
    }, 1000);
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Horn button */}
      <button
        onClick={blowHorn}
        disabled={hornDisabled}
        title={hornDisabled ? `Horn on cooldown (${hornCooldown}s)` : 'Blow the horn!'}
        className={cn(
          'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold border transition-all',
          hornDisabled
            ? 'border-gray-700 text-gray-600 cursor-not-allowed'
            : 'border-amber-700 bg-amber-900/40 text-amber-300 hover:bg-amber-800/60 active:scale-95',
        )}
      >
        <span>📯</span>
        {hornDisabled && hornCooldown > 0 && <span className="tabular-nums">{hornCooldown}s</span>}
      </button>

      {/* 🎵 — toggle volume panel visibility (does NOT stop music) */}
      <button
        onClick={togglePanel}
        title={panelOpen ? 'Hide music controls' : 'Show music controls'}
        className={cn(
          'rounded-lg px-2 py-1.5 text-xs border transition-colors',
          panelOpen
            ? 'border-violet-600 text-violet-300 bg-violet-900/40 hover:bg-violet-800/50'
            : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500',
        )}
      >
        🎵
      </button>

      {/* Volume slider — shown when panel is open */}
      {panelOpen && (
        <input
          type="range" min={0} max={1} step={0.05}
          value={musicVol}
          onChange={e => setMusicVol(Number(e.target.value))}
          title="Music volume"
          className="w-16 h-1 accent-violet-500 cursor-pointer"
        />
      )}

      {/* 🔊/🔇 — stop/start music engine */}
      <button
        onClick={toggleMusic}
        title={musicOn ? 'Stop music' : 'Play music'}
        className="rounded-lg px-2 py-1.5 text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
      >
        {musicOn ? '🔊' : '🔇'}
      </button>
    </div>
  );
}
