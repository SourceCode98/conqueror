/**
 * Sound panel: horn button (anti-spam) + mute toggle + music toggle.
 * Uses Web Audio API to generate simple sounds — no external audio files needed.
 */
import { useEffect, useRef, useState } from 'react';
import { wsService } from '../../services/wsService.js';
import { useGameStore } from '../../store/gameStore.js';
import { cn } from '../../lib/cn.js';
import { musicEngine, TRACKS } from './musicEngine.js';

const HORN_COOLDOWN_MS = 30_000;

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
  const [musicOn, setMusicOn] = useState(true);   // on by default
  const [musicVol, setMusicVol] = useState(0.45);
  const [hornDisabled, setHornDisabled] = useState(false);
  const [hornCooldown, setHornCooldown] = useState(0);
  const [trackIdx, setTrackIdx] = useState(0);
  const { toasts } = useGameStore();
  const musicAutoStarted = useRef(false);

  // Play SFX sounds when new toasts arrive
  const prevToastLen = useRef(toasts.length);
  useEffect(() => {
    if (toasts.length > prevToastLen.current) {
      const latest = toasts[toasts.length - 1];
      if (latest?.type === 'horn') safePlay(playHornSound);
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

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setGlobalMuted(next);
  }

  function changeTrack(delta: number) {
    const next = (trackIdx + delta + TRACKS.length) % TRACKS.length;
    setTrackIdx(next);
    musicEngine.setTrack(next);
  }

  async function toggleMusic() {
    if (musicOn) {
      musicEngine.stop();
      setMusicOn(false);
    } else {
      await musicEngine.start();
      musicEngine.setVolume(musicVol);
      setMusicOn(true);
    }
  }

  function blowHorn() {
    if (hornDisabled) return;
    wsService.send({ type: 'HORN', payload: { gameId } });
    safePlay(playHornSound);
    setHornDisabled(true);
    let remaining = HORN_COOLDOWN_MS / 1000;
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

      {/* Music toggle */}
      <button
        onClick={toggleMusic}
        title={musicOn ? 'Stop music' : 'Play background music'}
        className={cn(
          'rounded-lg px-2 py-1.5 text-xs border transition-colors',
          musicOn
            ? 'border-violet-600 text-violet-300 bg-violet-900/40 hover:bg-violet-800/50'
            : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500',
        )}
      >
        🎵
      </button>

      {/* Track selector — only when music is on */}
      {musicOn && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => changeTrack(-1)}
            title="Previous track"
            className="rounded px-1 py-1 text-xs text-violet-400 hover:text-violet-200 hover:bg-violet-900/40 transition-colors"
          >◀</button>
          <span className="text-xs text-violet-300 w-16 text-center truncate select-none">
            {TRACKS[trackIdx].name}
          </span>
          <button
            onClick={() => changeTrack(1)}
            title="Next track"
            className="rounded px-1 py-1 text-xs text-violet-400 hover:text-violet-200 hover:bg-violet-900/40 transition-colors"
          >▶</button>
        </div>
      )}

      {/* Music volume slider — only when music is on */}
      {musicOn && (
        <input
          type="range" min={0} max={1} step={0.05}
          value={musicVol}
          onChange={e => setMusicVol(Number(e.target.value))}
          title="Music volume"
          className="w-16 h-1 accent-violet-500 cursor-pointer"
        />
      )}

      {/* SFX mute toggle */}
      <button
        onClick={toggleMute}
        title={muted ? 'Unmute SFX' : 'Mute SFX'}
        className="rounded-lg px-2 py-1.5 text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
