import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../../store/gameStore.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

const RESOURCE_ICON: Record<string, { icon: string; color: string }> = {
  timber: { icon: '🪵', color: '#22c55e' },
  clay:   { icon: '🧱', color: '#f97316' },
  iron:   { icon: '⚙️', color: '#94a3b8' },
  grain:  { icon: '🌾', color: '#fbbf24' },
  wool:   { icon: '🐑', color: '#86efac' },
};

export default function MonopolyOverlay() {
  const { monopolyEvent, setMonopolyEvent, gameState } = useGameStore();

  useEffect(() => {
    if (!monopolyEvent) return;
    const t = setTimeout(() => setMonopolyEvent(null), 4500);
    return () => clearTimeout(t);
  }, [monopolyEvent]);

  if (!monopolyEvent) return null;

  const player = gameState?.players.find(p => p.id === monopolyEvent.playerId);
  const playerColor = player ? resolvePlayerColor(player.color) : '#fbbf24';
  const res = RESOURCE_ICON[monopolyEvent.resource] ?? { icon: '💰', color: '#fbbf24' };

  return (
    <AnimatePresence>
      {monopolyEvent && (
        <motion.div
          key={`monopoly-${monopolyEvent.playerId}-${monopolyEvent.resource}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)' }}
          onClick={() => setMonopolyEvent(null)}
        >
          <motion.div
            initial={{ scale: 0.55, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="relative flex flex-col items-center gap-5 rounded-3xl px-10 py-8 shadow-2xl pointer-events-auto select-none"
            style={{
              background: 'linear-gradient(145deg, rgba(20,14,2,0.97), rgba(35,25,3,0.97))',
              border: '1px solid rgba(251,191,36,0.35)',
              minWidth: 320,
            }}
          >
            {/* Player name */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2"
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ background: playerColor, boxShadow: `0 0 10px ${playerColor}` }}
              />
              <span className="text-sm font-bold" style={{ color: playerColor }}>
                {monopolyEvent.username}
              </span>
            </motion.div>

            {/* Main icon */}
            <motion.div
              className="relative flex items-center justify-center"
              style={{ width: 80, height: 80 }}
            >
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.6, 1.2], opacity: [0, 0.5, 0.3] }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="absolute rounded-full"
                style={{ width: 70, height: 70, background: '#fbbf24', filter: 'blur(20px)' }}
              />
              <motion.span
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: [0, 1.4, 1], rotate: [-20, 10, 0] }}
                transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.2 }}
                style={{ fontSize: 48, position: 'relative', zIndex: 1 }}
              >
                💰
              </motion.span>
            </motion.div>

            {/* Label */}
            <motion.span
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 350, damping: 18 }}
              className="text-2xl font-extrabold tracking-widest uppercase"
              style={{ color: '#fbbf24', textShadow: '0 0 18px #fbbf2488' }}
            >
              Monopolio
            </motion.span>

            {/* Resource stolen */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-2 rounded-xl px-5 py-2"
              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}
            >
              <span style={{ fontSize: 22 }}>{res.icon}</span>
              <span className="text-base font-bold" style={{ color: res.color }}>
                {monopolyEvent.resource}
              </span>
              <span className="text-lg font-extrabold text-white">
                ×{monopolyEvent.count}
              </span>
            </motion.div>

            <p className="text-[10px] text-gray-600">Tap to dismiss</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
