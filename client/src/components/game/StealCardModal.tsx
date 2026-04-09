/**
 * Full-screen steal card picker — shown during ROBBER phase after choosing a victim.
 * Large animated face-down cards; click any to steal.
 * After the server confirms, shows the revealed resource card.
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';

const CARD_THEME: Record<ResourceType, { bg: string; border: string; label: string }> = {
  timber: { bg: '#0f2e14', border: '#22c55e', label: 'Timber' },
  clay:   { bg: '#3b1004', border: '#f97316', label: 'Clay'   },
  iron:   { bg: '#131c2b', border: '#94a3b8', label: 'Iron'   },
  grain:  { bg: '#2e1d02', border: '#fbbf24', label: 'Grain'  },
  wool:   { bg: '#092b1b', border: '#86efac', label: 'Wool'   },
};

const PLAYER_COLORS: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', orange: '#f97316',
};

interface Props {
  victimId: string;
  cardCount: number;
  onSteal: () => void;
  onClose: () => void;
}

function CardBack({ onPick, delay }: { onPick: () => void; delay: number }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 40, rotate: -5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22, delay }}
      whileHover={{ y: -18, scale: 1.08, rotate: [-1, 1, -1, 0] as any, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.92, rotate: 5 }}
      onClick={onPick}
      className="relative flex-shrink-0 rounded-2xl select-none cursor-pointer"
      style={{
        width: 64, height: 96,
        background: 'linear-gradient(160deg, #0d2b0d 0%, #091a09 100%)',
        border: '2px solid #2d6b1e',
        boxShadow: '0 8px 24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
      aria-label="Steal this card"
    >
      {/* Outer ring */}
      <div className="absolute inset-1.5 rounded-xl border border-green-900/60 flex items-center justify-center">
        {/* Inner pattern */}
        <div className="absolute inset-1 rounded-lg border border-green-900/30"/>
        {/* Center symbol */}
        <span style={{ color: '#2d6b1e', fontSize: 22, lineHeight: 1 }}>◆</span>
      </div>
    </motion.button>
  );
}

export default function StealCardModal({ victimId, cardCount, onSteal, onClose }: Props) {
  const { gameState, localPlayerId } = useGameStore();
  const [stealing, setStealing] = useState(false);
  const [revealed, setRevealed] = useState<ResourceType | null>(null);
  const prevResourcesRef = useRef<Record<ResourceType, number> | null>(null);

  const victim = gameState?.players.find(p => p.id === victimId);
  const victimColor = PLAYER_COLORS[victim?.color ?? ''] ?? '#888';

  // Snapshot my resources before stealing
  function handlePick() {
    const me = gameState?.players.find(p => p.id === localPlayerId);
    if (me) {
      prevResourcesRef.current = { ...me.resources as Record<ResourceType, number> };
    }
    setStealing(true);
    onSteal();
  }

  // Watch for game state change to reveal what was stolen
  useEffect(() => {
    if (!stealing || !prevResourcesRef.current || !localPlayerId) return;
    const me = gameState?.players.find(p => p.id === localPlayerId);
    if (!me) return;
    const prev = prevResourcesRef.current;
    const gained = ALL_RESOURCES.find(r => (me.resources as any)[r] > prev[r]);
    if (gained) {
      setRevealed(gained);
      prevResourcesRef.current = null;
    }
  }, [gameState, stealing, localPlayerId]);

  // Fallback close if steal completes but no resource gained (victim had 0 cards)
  useEffect(() => {
    if (!stealing) return;
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [stealing]);

  // Auto-close after reveal
  useEffect(() => {
    if (revealed) {
      const t = setTimeout(onClose, 2500);
      return () => clearTimeout(t);
    }
  }, [revealed]);

  const displayCount = Math.min(cardCount, 7);

  return (
    <AnimatePresence>
      <motion.div
        key="steal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.75)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          onClick={e => e.stopPropagation()}
          className="bg-gray-900 rounded-3xl border border-gray-700 shadow-2xl px-8 py-6 max-w-sm w-full mx-4 text-center"
        >
          {/* Reveal state */}
          {revealed ? (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="space-y-3"
            >
              <p className="text-green-400 font-bold text-lg">You stole:</p>
              <div className="flex justify-center">
                <div className="rounded-2xl border-2 flex flex-col items-center px-4 py-3"
                  style={{ backgroundColor: CARD_THEME[revealed].bg, borderColor: CARD_THEME[revealed].border }}>
                  {RESOURCE_ICON_MAP[revealed]?.({ size: 48 })}
                  <span className="text-sm font-bold mt-2" style={{ color: CARD_THEME[revealed].border }}>
                    {CARD_THEME[revealed].label}
                  </span>
                </div>
              </div>
              <p className="text-gray-500 text-xs">Closing in a moment…</p>
            </motion.div>
          ) : stealing ? (
            <div className="space-y-3 py-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="mx-auto size-10 rounded-full border-2 border-amber-500 border-t-transparent"
              />
              <p className="text-amber-400 font-semibold">Stealing…</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <div className="size-3 rounded-full" style={{ backgroundColor: victimColor }}/>
                <p className="text-white font-bold text-lg">{victim?.username}</p>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Pick a card — {cardCount} available
              </p>

              {/* Cards */}
              {cardCount === 0 ? (
                <div className="py-6">
                  <p className="text-gray-500 text-sm italic">No resources to steal</p>
                  <button className="btn-primary mt-4 px-6 text-sm" onClick={() => { onSteal(); setStealing(true); }}>
                    Confirm (no steal)
                  </button>
                </div>
              ) : (
                <div className="flex items-end justify-center gap-3 mb-5"
                  style={{ minHeight: 112 }}>
                  {Array.from({ length: displayCount }, (_, i) => (
                    <CardBack key={i} onPick={handlePick} delay={i * 0.04}/>
                  ))}
                  {cardCount > 7 && (
                    <span className="text-gray-500 text-xs self-center">+{cardCount - 7}</span>
                  )}
                </div>
              )}

              {/* Cancel */}
              <button className="text-xs text-gray-600 hover:text-gray-400 underline"
                onClick={onClose}>
                Cancel
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
