import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../../store/gameStore.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

export default function DealClosedOverlay() {
  const { dealClosed, setDealClosed, gameState } = useGameStore();

  // Auto-dismiss after 3.5s
  useEffect(() => {
    if (!dealClosed) return;
    const t = setTimeout(() => setDealClosed(null), 3500);
    return () => clearTimeout(t);
  }, [dealClosed]);

  const activePlayer = dealClosed ? gameState?.players.find(p => p.id === dealClosed.activePlayerId) : null;
  const partner      = dealClosed ? gameState?.players.find(p => p.id === dealClosed.partnerId)      : null;

  const activeColor  = activePlayer ? resolvePlayerColor(activePlayer.color) : '#888';
  const partnerColor = partner      ? resolvePlayerColor(partner.color)      : '#888';

  return (
    <AnimatePresence>
      {dealClosed && activePlayer && partner && (
        <motion.div
          key="deal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDealClosed(null)}
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: 30 }}
            animate={{ scale: 1,   opacity: 1, y: 0 }}
            exit={{    scale: 0.85, opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className="relative flex flex-col items-center gap-5 rounded-3xl px-8 py-7 shadow-2xl pointer-events-auto select-none"
            style={{
              background: 'linear-gradient(145deg, rgba(15,20,35,0.97), rgba(25,32,52,0.97))',
              border: '1px solid rgba(251,191,36,0.3)',
              minWidth: 320,
            }}
          >
            {/* Players row */}
            <div className="flex items-center gap-6 w-full justify-center">
              {/* Left player */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-14 h-14 rounded-full shadow-lg"
                  style={{ background: activeColor, boxShadow: `0 0 20px ${activeColor}88` }}
                />
                <span className="text-sm font-bold text-white">{activePlayer.username}</span>
              </div>

              {/* Handshake */}
              <div className="flex flex-col items-center gap-1">
                <HandshakeAnimation leftColor={activeColor} rightColor={partnerColor} />
                <span
                  className="text-base font-extrabold tracking-widest uppercase mt-1"
                  style={{ color: '#fbbf24', textShadow: '0 0 12px #fbbf2488' }}
                >
                  Deal Closed!
                </span>
              </div>

              {/* Right player */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-14 h-14 rounded-full shadow-lg"
                  style={{ background: partnerColor, boxShadow: `0 0 20px ${partnerColor}88` }}
                />
                <span className="text-sm font-bold text-white">{partner.username}</span>
              </div>
            </div>

            <p className="text-xs text-gray-500">Tap to dismiss</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HandshakeAnimation({ leftColor, rightColor }: { leftColor: string; rightColor: string }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 96, height: 64 }}>
      {/* Left fist */}
      <motion.div
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.15 }}
        className="absolute left-0"
        style={{ fontSize: 38, filter: `drop-shadow(0 0 6px ${leftColor})` }}
      >
        🤜
      </motion.div>

      {/* Right fist */}
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.15 }}
        className="absolute right-0"
        style={{ fontSize: 38, filter: `drop-shadow(0 0 6px ${rightColor})` }}
      >
        🤛
      </motion.div>

      {/* Impact flash */}
      <motion.div
        initial={{ scale: 0, opacity: 0.8 }}
        animate={{ scale: [0, 1.4, 0], opacity: [0.8, 0.5, 0] }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="absolute rounded-full"
        style={{ width: 36, height: 36, background: '#fbbf24', filter: 'blur(8px)' }}
      />
    </div>
  );
}
