import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { PublicGameState } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

// ── Confetti ────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  '#f59e0b', '#fbbf24', '#10b981', '#34d399',
  '#3b82f6', '#60a5fa', '#ef4444', '#f87171',
  '#8b5cf6', '#a78bfa', '#ec4899', '#f472b6',
];

interface ConfettiPiece {
  id: number;
  color: string;
  left: number;   // vw %
  delay: number;  // s
  dur: number;    // s
  size: number;   // px
  shape: 'rect' | 'circle' | 'strip';
  rotate: number; // initial deg
}

function makeConfetti(n: number): ConfettiPiece[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: (i * 97 + 11) % 100,
    delay: (i * 0.11) % 3,
    dur: 2.8 + (i * 0.19) % 2,
    size: 6 + (i % 4) * 3,
    shape: (['rect', 'rect', 'circle', 'strip'] as const)[i % 4],
    rotate: (i * 37) % 360,
  }));
}

const PIECES = makeConfetti(60);

function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-[98]">
      {PIECES.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            top: '-24px',
            left: `${p.left}%`,
            width:  p.shape === 'strip' ? p.size / 3 : p.size,
            height: p.shape === 'strip' ? p.size * 3  : p.size,
            borderRadius: p.shape === 'circle' ? '50%' : 2,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.dur}s ${p.delay}s ease-in infinite`,
            opacity: 0.92,
          }}
        />
      ))}
    </div>
  );
}

// ── Score row ───────────────────────────────────────────────────────────────

function ScoreRow({
  rank, username, color, total, isWinner, isMe,
}: {
  rank: number; username: string; color: string;
  total: number; isWinner: boolean; isMe: boolean;
}) {
  const hex = resolvePlayerColor(color);
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + rank * 0.08 }}
      className="flex items-center gap-3 rounded-xl px-4 py-2.5"
      style={{
        background: isWinner
          ? `linear-gradient(90deg, ${hex}22, ${hex}10)`
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isWinner ? hex + '60' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <span className="text-gray-500 text-sm w-4 text-right font-mono">{rank}</span>
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: hex, boxShadow: `0 0 6px ${hex}80` }}
      />
      <span className={`flex-1 text-sm font-semibold ${isMe ? 'text-white' : 'text-gray-300'}`}>
        {username} {isMe && <span className="text-[10px] text-gray-500 font-normal">(you)</span>}
      </span>
      <span className="text-xs text-gray-400 tabular-nums">
        <span className="font-bold" style={{ color: isWinner ? hex : undefined }}>{total} VP</span>
      </span>
    </motion.div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  gameState: PublicGameState;
  localPlayerId: string | null;
}

export default function WinCelebration({ gameState, localPlayerId }: Props) {
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const audioCtx = useRef<AudioContext | null>(null);
  const finalScores = useGameStore(s => s.finalScores);

  const winner = gameState.players.find(p => p.id === gameState.winner);
  const iAmWinner = localPlayerId === gameState.winner;
  const winnerColor = resolvePlayerColor(winner?.color ?? 'red');

  // Fanfare: simple tone sequence via Web Audio
  useEffect(() => {
    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const notes = iAmWinner
        ? [523, 659, 784, 1047]   // C E G C — triumphant
        : [440, 523, 659];        // A C E — short acknowledgement
      const t0 = ctx.currentTime + 0.1;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const start = t0 + i * 0.18;
        const end = start + (i === notes.length - 1 ? 0.6 : 0.15);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, end);
        osc.start(start);
        osc.stop(end + 0.05);
      });
    } catch {}
    return () => { audioCtx.current?.close(); };
  }, [iAmWinner]);

  // Sorted final scores — prefer the revealed finalScores from GAME_OVER message
  const getScore = (p: (typeof gameState.players)[number]) =>
    finalScores?.[p.id] ?? (p.victoryPoints + (p.victoryPointCards ?? 0));
  const sorted = [...gameState.players].sort((a, b) => getScore(b) - getScore(a));

  return (
    <AnimatePresence>
      <motion.div
        key="win-overlay"
        className="fixed inset-0 z-[99] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Confetti — only for the winner */}
        {iAmWinner && <Confetti />}

        {/* Card */}
        <motion.div
          className="relative z-[99] w-full max-w-sm mx-4 rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(160deg, #0f1629 0%, #1a1030 100%)',
            border: `1.5px solid ${winnerColor}60`,
            boxShadow: `0 0 60px ${winnerColor}30, 0 25px 50px rgba(0,0,0,0.7)`,
          }}
          initial={{ scale: 0.7, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.15 }}
        >
          {/* Glow bar at top in winner color */}
          <div
            className="h-1.5 w-full"
            style={{ background: `linear-gradient(90deg, transparent, ${winnerColor}, transparent)` }}
          />

          <div className="px-6 pt-6 pb-7 flex flex-col gap-4">
            {/* Trophy + name */}
            <div className="flex flex-col items-center gap-2 text-center">
              <motion.div
                className="text-6xl select-none"
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.3 }}
              >
                {iAmWinner ? '🏆' : '🎖️'}
              </motion.div>

              <motion.h1
                className="text-3xl font-extrabold tracking-tight leading-tight"
                style={{ color: winnerColor, textShadow: `0 0 24px ${winnerColor}60` }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                {t('win.title', { player: winner?.username })}
              </motion.h1>

              <motion.p
                className="text-sm text-gray-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                {t('win.points', { points: winner ? getScore(winner) : 0 })}
              </motion.p>
            </div>

            {/* Score table */}
            <div className="flex flex-col gap-1.5">
              {sorted.map((p, i) => (
                <ScoreRow
                  key={p.id}
                  rank={i + 1}
                  username={p.username}
                  color={p.color}
                  total={getScore(p)}
                  isWinner={p.id === gameState.winner}
                  isMe={p.id === localPlayerId}
                />
              ))}
            </div>

            {/* Back to lobby */}
            <motion.button
              className="w-full rounded-2xl py-3 font-bold text-sm transition-all active:scale-[0.97]"
              style={{
                background: `linear-gradient(90deg, ${winnerColor}cc, ${winnerColor})`,
                color: '#000',
                boxShadow: `0 4px 20px ${winnerColor}50`,
              }}
              whileHover={{ scale: 1.02 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              onClick={() => navigate('/lobby')}
            >
              {t('win.playAgain')} →
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
