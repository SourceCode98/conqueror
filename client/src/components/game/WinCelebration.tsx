import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { PublicGameState } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

// ── Confetti ────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  '#f59e0b', '#fbbf24', '#10b981', '#34d399',
  '#3b82f6', '#60a5fa', '#ef4444', '#f87171',
  '#8b5cf6', '#a78bfa', '#ec4899', '#f472b6',
];

interface ConfettiPiece {
  id: number; color: string; left: number; delay: number;
  dur: number; size: number; shape: 'rect' | 'circle' | 'strip'; rotate: number;
}

function makeConfetti(n: number): ConfettiPiece[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: (i * 97 + 11) % 100, delay: (i * 0.11) % 3,
    dur: 2.8 + (i * 0.19) % 2, size: 6 + (i % 4) * 3,
    shape: (['rect', 'rect', 'circle', 'strip'] as const)[i % 4],
    rotate: (i * 37) % 360,
  }));
}

const PIECES = makeConfetti(60);

function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-[98]">
      {PIECES.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: '-24px', left: `${p.left}%`,
          width: p.shape === 'strip' ? p.size / 3 : p.size,
          height: p.shape === 'strip' ? p.size * 3 : p.size,
          borderRadius: p.shape === 'circle' ? '50%' : 2,
          backgroundColor: p.color, transform: `rotate(${p.rotate}deg)`,
          animation: `confetti-fall ${p.dur}s ${p.delay}s ease-in infinite`, opacity: 0.92,
        }} />
      ))}
    </div>
  );
}

// ── Score row ───────────────────────────────────────────────────────────────

function ScoreRow({ rank, username, color, total, isWinner, isMe }: {
  rank: number; username: string; color: string;
  total: number; isWinner: boolean; isMe: boolean;
}) {
  const hex = resolvePlayerColor(color);
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + rank * 0.08 }}
      className="flex items-center gap-3 rounded-xl px-4 py-2.5"
      style={{
        background: isWinner ? `linear-gradient(90deg, ${hex}22, ${hex}10)` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isWinner ? hex + '60' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <span className="text-gray-500 text-sm w-4 text-right font-mono">{rank}</span>
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: hex, boxShadow: `0 0 6px ${hex}80` }} />
      <span className={`flex-1 text-sm font-semibold ${isMe ? 'text-white' : 'text-gray-300'}`}>
        {username} {isMe && <span className="text-[10px] text-gray-500 font-normal">(you)</span>}
      </span>
      <span className="text-xs text-gray-400 tabular-nums">
        <span className="font-bold" style={{ color: isWinner ? hex : undefined }}>{total} VP</span>
      </span>
    </motion.div>
  );
}

// ── Play-again vote row ──────────────────────────────────────────────────────

function VoteRow({ username, color, vote }: { username: string; color: string; vote: boolean | null }) {
  const hex = resolvePlayerColor(color);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
      <span className="flex-1 text-gray-300 truncate">{username}</span>
      {vote === true  && <span className="text-green-400 font-bold text-xs">✓ Play</span>}
      {vote === false && <span className="text-red-400 font-bold text-xs">✗ Leave</span>}
      {vote === null  && (
        <span className="flex items-center gap-1 text-gray-500 text-xs">
          <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>…</motion.span>
          Deciding
        </span>
      )}
    </div>
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

  const { finalScores, playAgainPoll, playAgainResult, clearPlayAgain } = useGameStore();

  const winner = gameState.players.find(p => p.id === gameState.winner);
  const iAmWinner = localPlayerId === gameState.winner;
  const winnerColor = resolvePlayerColor(winner?.color ?? 'red');

  // Local countdown — seeded from server, counts down independently
  const [countdown, setCountdown] = useState<number>(60);
  const [myVote, setMyVote] = useState<boolean | null>(null);
  const gameId = gameState.gameId as string;

  // Sync countdown when a new poll arrives
  useEffect(() => {
    if (playAgainPoll) setCountdown(playAgainPoll.secondsLeft);
  }, [playAgainPoll?.secondsLeft]);

  // Tick down locally every second
  useEffect(() => {
    if (!playAgainPoll) return;
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [!!playAgainPoll]);

  // Navigate when result arrives
  useEffect(() => {
    if (!playAgainResult) return;
    clearPlayAgain();
    if (playAgainResult.type === 'start') {
      navigate(`/game/${playAgainResult.newGameId}`);
    } else {
      navigate('/lobby');
    }
  }, [playAgainResult]);

  // Fanfare
  useEffect(() => {
    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const notes = iAmWinner ? [523, 659, 784, 1047] : [440, 523, 659];
      const t0 = ctx.currentTime + 0.1;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        const start = t0 + i * 0.18;
        const end = start + (i === notes.length - 1 ? 0.6 : 0.15);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, end);
        osc.start(start); osc.stop(end + 0.05);
      });
    } catch {}
    return () => { audioCtx.current?.close(); };
  }, [iAmWinner]);

  const getScore = (p: (typeof gameState.players)[number]) =>
    finalScores?.[p.id] ?? (p.victoryPoints + (p.victoryPointCards ?? 0));
  const sorted = [...gameState.players].sort((a, b) => getScore(b) - getScore(a));

  function vote(accept: boolean) {
    setMyVote(accept);
    wsService.send({ type: 'PLAY_AGAIN_VOTE', payload: { gameId, accept } });
  }

  // Countdown ring color
  const fraction = countdown / 60;
  const ringColor = fraction > 0.5 ? '#10b981' : fraction > 0.25 ? '#f59e0b' : '#ef4444';

  return (
    <AnimatePresence>
      <motion.div
        key="win-overlay"
        className="fixed inset-0 z-[99] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      >
        {iAmWinner && <Confetti />}

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
          {/* Glow bar */}
          <div className="h-1.5 w-full"
            style={{ background: `linear-gradient(90deg, transparent, ${winnerColor}, transparent)` }} />

          <div className="px-6 pt-6 pb-7 flex flex-col gap-4">
            {/* Trophy + name */}
            <div className="flex flex-col items-center gap-2 text-center">
              <motion.div className="text-6xl select-none"
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.3 }}>
                {iAmWinner ? '🏆' : '🎖️'}
              </motion.div>
              <motion.h1 className="text-3xl font-extrabold tracking-tight leading-tight"
                style={{ color: winnerColor, textShadow: `0 0 24px ${winnerColor}60` }}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                {t('win.title', { player: winner?.username })}
              </motion.h1>
              <motion.p className="text-sm text-gray-400"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
                {t('win.points', { points: winner ? getScore(winner) : 0 })}
              </motion.p>
            </div>

            {/* Score table */}
            <div className="flex flex-col gap-1.5">
              {sorted.map((p, i) => (
                <ScoreRow key={p.id} rank={i + 1} username={p.username} color={p.color}
                  total={getScore(p)} isWinner={p.id === gameState.winner} isMe={p.id === localPlayerId} />
              ))}
            </div>

            {/* ── Play-again voting panel ── */}
            {playAgainPoll ? (
              <motion.div
                className="rounded-2xl border border-gray-700 bg-gray-800/60 p-4 flex flex-col gap-3"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              >
                {/* Header + countdown */}
                <div className="flex items-center justify-between">
                  <span className="text-white font-bold text-sm">Play Again?</span>
                  <div className="flex items-center gap-2">
                    <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
                      <circle cx="14" cy="14" r="11" fill="none" stroke="#374151" strokeWidth="3"/>
                      <circle cx="14" cy="14" r="11" fill="none" stroke={ringColor} strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 11}`}
                        strokeDashoffset={`${2 * Math.PI * 11 * (1 - fraction)}`}
                        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
                      />
                    </svg>
                    <span className="text-sm font-bold tabular-nums" style={{ color: ringColor }}>{countdown}s</span>
                  </div>
                </div>

                {/* Player votes */}
                <div className="flex flex-col gap-1.5">
                  {gameState.players.map(p => (
                    <VoteRow
                      key={p.id}
                      username={p.username}
                      color={p.color}
                      vote={playAgainPoll.votes[p.id] ?? null}
                    />
                  ))}
                </div>

                {/* Action buttons */}
                {myVote === null ? (
                  <div className="flex gap-2 mt-1">
                    <button
                      className="flex-1 rounded-xl bg-green-600 hover:bg-green-500 active:scale-95 text-white font-bold text-sm py-2.5 transition-all"
                      onClick={() => vote(true)}
                    >
                      ✓ Play Again
                    </button>
                    <button
                      className="flex-1 rounded-xl bg-gray-700 hover:bg-gray-600 active:scale-95 text-gray-200 font-bold text-sm py-2.5 transition-all"
                      onClick={() => vote(false)}
                    >
                      ✗ Leave
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-xs text-gray-400 mt-1">
                    {myVote ? '✓ Waiting for others…' : '✗ You chose to leave'}
                  </p>
                )}
              </motion.div>
            ) : (
              /* Fallback: simple lobby button before poll arrives */
              <motion.button
                className="w-full rounded-2xl py-3 font-bold text-sm transition-all active:scale-[0.97]"
                style={{
                  background: `linear-gradient(90deg, ${winnerColor}cc, ${winnerColor})`,
                  color: '#000', boxShadow: `0 4px 20px ${winnerColor}50`,
                }}
                whileHover={{ scale: 1.02 }}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}
                onClick={() => navigate('/lobby')}
              >
                {t('win.playAgain')} →
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
