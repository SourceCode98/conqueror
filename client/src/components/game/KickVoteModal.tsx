import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';

interface Props {
  gameId: string;
}

export default function KickVoteModal({ gameId }: Props) {
  const { kickVote, localPlayerId } = useGameStore();

  const [localSecs, setLocalSecs] = useState(0);
  const [hasSentVote, setHasSentVote] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync countdown with server (new vote session)
  useEffect(() => {
    if (!kickVote) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // reset state
    setLocalSecs(kickVote.secondsLeft);
    setHasSentVote(false);

    // clear previous interval
    if (timerRef.current) clearInterval(timerRef.current);

    // start new interval
    timerRef.current = setInterval(() => {
      setLocalSecs((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [kickVote?.targetId]);

  if (!kickVote) return null;

  const isTarget = localPlayerId === kickVote.targetId;
  const myVote =
    localPlayerId != null ? kickVote.votes[localPlayerId] : undefined;

  const canVote =
    !isTarget && myVote === null && !hasSentVote;

  const yesCount = Object.values(kickVote.votes).filter(
    (v) => v === true
  ).length;

  const noCount = Object.values(kickVote.votes).filter(
    (v) => v === false
  ).length;

  const threshold =
    Math.floor(kickVote.eligibleCount / 2) + 1;

  function vote(yes: boolean) {
    if (!canVote) return;

    setHasSentVote(true);

    wsService.send({
      type: 'KICK_VOTE',
      payload: { gameId, vote: yes },
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        key={kickVote.targetId}
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        style={{ pointerEvents: 'auto' }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] w-72 rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-800">
          <motion.div
            className="h-full bg-amber-500"
            initial={{ width: '100%' }}
            animate={{ width: `${(localSecs / 30) * 100}%` }}
            transition={{ duration: 1, ease: 'linear' }}
          />
        </div>

        <div className="p-4">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🗳️</span>

            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 leading-none truncate">
                {kickVote.initiatorUsername} inició una votación
              </p>

              <p className="text-sm font-bold text-white leading-snug mt-0.5">
                ¿Expulsar a{' '}
                <span className="text-red-400">
                  {kickVote.targetUsername}
                </span>
                ?
              </p>
            </div>

            <span className="text-xs font-mono tabular-nums text-amber-400 shrink-0 font-bold">
              {localSecs}s
            </span>
          </div>

          {/* Vote tally */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-green-900/40 border border-green-800 rounded-lg py-1.5 text-center">
              <span className="text-green-400 font-bold text-lg">
                {yesCount}
              </span>
              <span className="text-green-600 text-xs block mt-0.5">
                Sí
              </span>
            </div>

            <div className="flex-1 bg-red-900/40 border border-red-800 rounded-lg py-1.5 text-center">
              <span className="text-red-400 font-bold text-lg">
                {noCount}
              </span>
              <span className="text-red-600 text-xs block mt-0.5">
                No
              </span>
            </div>

            <div className="flex-1 bg-gray-800 border border-gray-700 rounded-lg py-1.5 text-center">
              <span className="text-white font-bold text-lg">
                {threshold}
              </span>
              <span className="text-gray-500 text-xs block mt-0.5">
                Mínimo
              </span>
            </div>
          </div>

          {/* Action area */}
          {isTarget ? (
            <p className="text-center text-xs text-gray-500 py-1">
              Estás siendo votado para expulsión
            </p>
          ) : myVote !== null && myVote !== undefined ? (
            <p className="text-center text-xs text-gray-400 py-1">
              Voto registrado — {myVote ? '✓ Sí' : '✗ No'}
            </p>
          ) : hasSentVote ? (
            <p className="text-center text-xs text-gray-400 py-1">
              Enviando voto…
            </p>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => vote(true)}
                disabled={!canVote}
                className="flex-1 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 active:scale-95 text-white text-sm font-semibold transition-all"
              >
                ✓ Expulsar
              </button>

              <button
                type="button"
                onClick={() => vote(false)}
                disabled={!canVote}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 active:scale-95 text-gray-200 text-sm font-semibold transition-all"
              >
                ✗ Mantener
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}