/**
 * Turn countdown timer.
 * When the timer expires and it's the local player's turn, auto-sends END_TURN.
 */
import { useEffect, useRef, useState } from 'react';
import { wsService } from '../../services/wsService.js';
import { cn } from '../../lib/cn.js';

interface Props {
  turnStartTime: number;
  turnPausedAt: number | null;
  turnTimeLimit: number;   // seconds
  isMyTurn: boolean;
  gameId: string;
  className?: string;
}

export default function TurnTimer({ turnStartTime, turnPausedAt, turnTimeLimit, isMyTurn, gameId, className }: Props) {
  const computeSecondsLeft = () => {
    const effectiveStart = turnPausedAt !== null ? turnPausedAt : Date.now();
    const elapsed = (effectiveStart - turnStartTime) / 1000;
    return Math.max(0, Math.ceil(turnTimeLimit - elapsed));
  };

  const [secondsLeft, setSecondsLeft] = useState(computeSecondsLeft);
  const autoEndSentRef = useRef(false);

  useEffect(() => {
    autoEndSentRef.current = false;
    setSecondsLeft(computeSecondsLeft());

    if (turnPausedAt !== null) return; // timer frozen

    const tick = () => {
      const elapsed = (Date.now() - turnStartTime) / 1000;
      const left = Math.max(0, Math.ceil(turnTimeLimit - elapsed));
      setSecondsLeft(left);

      if (left === 0 && isMyTurn && !autoEndSentRef.current) {
        autoEndSentRef.current = true;
        wsService.send({ type: 'FORCE_END_TURN', payload: { gameId } });
      }
    };

    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [turnStartTime, turnPausedAt, turnTimeLimit, isMyTurn, gameId]);

  const paused = turnPausedAt !== null;
  const pct = (secondsLeft / turnTimeLimit) * 100;
  const urgent = !paused && secondsLeft <= 10;
  const warning = !paused && secondsLeft <= 20 && secondsLeft > 10;

  return (
    <div className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1 border text-xs font-mono tabular-nums',
      paused
        ? 'border-blue-700 bg-blue-950/50 text-blue-400'
        : urgent
          ? 'border-red-600 bg-red-950/60 text-red-300 animate-pulse'
          : warning
            ? 'border-yellow-600 bg-yellow-950/50 text-yellow-300'
            : 'border-gray-600 bg-gray-800/60 text-gray-400',
      className,
    )}>
      {paused ? (
        <span>⏸</span>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth="2"/>
          <circle
            cx="7" cy="7" r="5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * 5.5}`}
            strokeDashoffset={`${2 * Math.PI * 5.5 * (1 - pct / 100)}`}
            strokeLinecap="round"
            transform="rotate(-90 7 7)"
            style={{ transition: 'stroke-dashoffset 0.5s linear' }}
          />
        </svg>
      )}
      <span>{paused ? 'Paused' : `${secondsLeft}s`}</span>
    </div>
  );
}
