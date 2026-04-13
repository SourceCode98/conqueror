import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../../store/gameStore.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

// ── Per-effect config ─────────────────────────────────────────────────────────

const EFFECT_CONFIG = {
  siege: {
    label: 'Siege!',
    labelColor: '#f97316',
    glowColor: '#f97316',
    icon: '⛓️',
    attackerIcon: '⚔️',
    defenderIcon: '🏰',
    bg: 'linear-gradient(145deg, rgba(15,10,5,0.97), rgba(30,15,5,0.97))',
    border: 'rgba(249,115,22,0.35)',
    duration: 4000,
  },
  destruction_choice: {
    label: 'Destruction!',
    labelColor: '#ef4444',
    glowColor: '#ef4444',
    icon: '💥',
    attackerIcon: '⚔️',
    defenderIcon: '🏚️',
    bg: 'linear-gradient(145deg, rgba(20,5,5,0.97), rgba(35,8,8,0.97))',
    border: 'rgba(239,68,68,0.35)',
    duration: 4000,
  },
  repelled: {
    label: 'Repelled!',
    labelColor: '#22c55e',
    glowColor: '#22c55e',
    icon: '🛡️',
    attackerIcon: '💨',
    defenderIcon: '🏅',
    bg: 'linear-gradient(145deg, rgba(5,15,10,0.97), rgba(5,25,12,0.97))',
    border: 'rgba(34,197,94,0.35)',
    duration: 4000,
  },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function WarEventOverlay() {
  const { warEvent, setWarEvent, gameState } = useGameStore();

  useEffect(() => {
    if (!warEvent) return;
    const cfg = EFFECT_CONFIG[warEvent.effect];
    const t = setTimeout(() => setWarEvent(null), cfg.duration);
    return () => clearTimeout(t);
  }, [warEvent]);

  const attacker = warEvent ? gameState?.players.find(p => p.id === warEvent.attackerId) : null;
  const defender = warEvent ? gameState?.players.find(p => p.id === warEvent.defenderId) : null;

  const attackerColor = attacker ? resolvePlayerColor(attacker.color) : '#ef4444';
  const defenderColor = defender ? resolvePlayerColor(defender.color) : '#3b82f6';

  return (
    <AnimatePresence>
      {warEvent && attacker && defender && (() => {
        const cfg = EFFECT_CONFIG[warEvent.effect];
        const isRepelled = warEvent.effect === 'repelled';

        return (
          <motion.div
            key={`war-${warEvent.effect}-${warEvent.attackerId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)' }}
            onClick={() => setWarEvent(null)}
          >
            <motion.div
              initial={{ scale: 0.55, opacity: 0, y: 40 }}
              animate={{ scale: 1,    opacity: 1, y: 0  }}
              exit={{    scale: 0.85, opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="relative flex flex-col items-center gap-5 rounded-3xl px-8 py-7 shadow-2xl pointer-events-auto select-none"
              style={{
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                minWidth: 320,
              }}
            >
              {/* Players row */}
              <div className="flex items-center gap-6 w-full justify-center">

                {/* Attacker side */}
                <PlayerSide
                  color={attackerColor}
                  name={attacker.username}
                  roleIcon={cfg.attackerIcon}
                  won={!isRepelled}
                  fromLeft
                />

                {/* Center event animation */}
                <div className="flex flex-col items-center gap-2">
                  <CenterAnimation effect={warEvent.effect} cfg={cfg} />
                  <motion.span
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, type: 'spring', stiffness: 350, damping: 18 }}
                    className="text-base font-extrabold tracking-widest uppercase"
                    style={{ color: cfg.labelColor, textShadow: `0 0 14px ${cfg.glowColor}88` }}
                  >
                    {cfg.label}
                  </motion.span>
                </div>

                {/* Defender side */}
                <PlayerSide
                  color={defenderColor}
                  name={defender.username}
                  roleIcon={cfg.defenderIcon}
                  won={isRepelled}
                  fromLeft={false}
                />
              </div>

              {/* Context line */}
              <p className="text-xs text-gray-500">
                {isRepelled
                  ? `${defender.username} successfully defended`
                  : warEvent.effect === 'siege'
                    ? `${attacker.username} placed ${defender.username} under siege`
                    : `${attacker.username} destroyed a building of ${defender.username}`
                }
              </p>

              <p className="text-[10px] text-gray-600">Tap to dismiss</p>
            </motion.div>
          </motion.div>
        );
      })()}
    </AnimatePresence>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlayerSide({
  color, name, roleIcon, won, fromLeft,
}: {
  color: string; name: string; roleIcon: string; won: boolean; fromLeft: boolean;
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-2"
      initial={{ x: fromLeft ? -50 : 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.1 }}
    >
      <div className="relative">
        <div
          className="w-14 h-14 rounded-full shadow-lg"
          style={{
            background: color,
            boxShadow: `0 0 ${won ? 24 : 10}px ${color}${won ? 'cc' : '44'}`,
            opacity: won ? 1 : 0.65,
          }}
        />
        {/* Role icon badge */}
        <span
          className="absolute -bottom-1 -right-1 text-lg"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}
        >
          {roleIcon}
        </span>
      </div>
      <span className="text-sm font-bold" style={{ color: won ? '#fff' : '#9ca3af' }}>
        {name}
      </span>
    </motion.div>
  );
}

function CenterAnimation({
  effect, cfg,
}: {
  effect: 'siege' | 'destruction_choice' | 'repelled';
  cfg: (typeof EFFECT_CONFIG)[keyof typeof EFFECT_CONFIG];
}) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      {/* Radial glow */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.6, 1.2], opacity: [0, 0.5, 0.3] }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="absolute rounded-full"
        style={{ width: 64, height: 64, background: cfg.glowColor, filter: 'blur(16px)' }}
      />

      {/* Main icon — bounces in */}
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={
          effect === 'siege'
            ? { scale: 1, rotate: 0 }
            : effect === 'destruction_choice'
            ? { scale: [0, 1.4, 1], rotate: [-30, 15, 0] }
            : { scale: [0, 1.3, 1], rotate: [30, -10, 0] }
        }
        transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.2 }}
        style={{ fontSize: 42, position: 'relative', zIndex: 1 }}
      >
        {cfg.icon}
      </motion.span>

      {/* Siege: orbiting chain links */}
      {effect === 'siege' && (
        <>
          {[0, 120, 240].map((deg, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0.7], scale: 1, rotate: deg + 360 }}
              transition={{ duration: 2.5, delay: 0.5 + i * 0.15, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                fontSize: 14,
                transformOrigin: '36px 36px',
                left: -10, top: -10,
              }}
            >
              🔗
            </motion.span>
          ))}
        </>
      )}

      {/* Destruction: sparks flying out */}
      {effect === 'destruction_choice' && (
        <>
          {[0, 60, 120, 180, 240, 300].map((deg, i) => (
            <motion.div
              key={i}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos((deg * Math.PI) / 180) * 40,
                y: Math.sin((deg * Math.PI) / 180) * 40,
                opacity: 0,
                scale: 0.3,
              }}
              transition={{ duration: 0.7, delay: 0.35 + i * 0.04 }}
              style={{
                position: 'absolute',
                width: 6, height: 6,
                borderRadius: '50%',
                background: i % 2 === 0 ? '#ef4444' : '#fbbf24',
              }}
            />
          ))}
        </>
      )}

      {/* Repelled: ripple rings */}
      {effect === 'repelled' && (
        <>
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              initial={{ scale: 0.5, opacity: 0.7 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 1.2, delay: 0.3 + i * 0.3, repeat: Infinity }}
              style={{
                position: 'absolute',
                width: 50, height: 50,
                borderRadius: '50%',
                border: `2px solid ${cfg.glowColor}`,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
