/**
 * Sound panel: horn button (anti-spam) + mute toggle + music toggle.
 * Uses Web Audio API to generate simple sounds — no external audio files needed.
 */
import { useEffect, useRef, useState } from 'react';
import { wsService } from '../../services/wsService.js';
import { useGameStore } from '../../store/gameStore.js';
import { useProfileStore } from '../../store/profileStore.js';
import { cn } from '../../lib/cn.js';

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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  gameId: string;
  className?: string;
}

export default function SoundPanel({ gameId, className }: Props) {
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [musicVol, setMusicVol] = useState(0.45);
  const [hornDisabled, setHornDisabled] = useState(false);
  const [hornCooldown, setHornCooldown] = useState(0);
  const toasts = useGameStore(s => s.toasts);
  const gameState = useGameStore(s => s.gameState);
  const { profile } = useProfileStore();
  const selectedHorn = profile?.selectedHorn ?? 'horn_default';
  const hornCooldownMs = ((gameState?.hornCooldownSecs) ?? 30) * 1000;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio('/aoest.mp3');
    audio.loop = true;
    audio.volume = musicVol;
    audioRef.current = audio;
    const tryStart = () => { audio.play().catch(() => {}); };
    document.addEventListener('pointerdown', tryStart, { once: true });
    return () => {
      document.removeEventListener('pointerdown', tryStart);
      audio.pause();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVol;
  }, [musicVol]);

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

  function togglePanel() { setPanelOpen(o => !o); }

  function toggleMusic() {
    if (musicOn) {
      audioRef.current?.pause();
      setMusicOn(false);
    } else {
      audioRef.current?.play().catch(() => {});
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
