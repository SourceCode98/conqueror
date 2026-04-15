import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';
import { Die } from './DiceRoller.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

const PIPS_PLACEHOLDER = 1; // shown while waiting to roll

export function CombatResultModal() {
  const combatModal = useGameStore(s => s.combatModal);
  const clearCombatModal = useGameStore(s => s.clearCombatModal);
  const localPlayerId = useGameStore(s => s.localPlayerId);
  const gameState = useGameStore(s => s.gameState);

  // Never show dice combat UI when coliseum mode is active
  if (gameState?.warVariants?.coliseum) return null;

  // Rolling animation state per side
  const [attackerRolling, setAttackerRolling] = useState(false);
  const [defenderRolling, setDefenderRolling] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // Start countdown when rolling phase begins
  useEffect(() => {
    if (!combatModal || combatModal.phase !== 'rolling') return;
    setTimeLeft(combatModal.timeoutSecs);
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [combatModal?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger animation when a die is revealed
  useEffect(() => {
    if (!combatModal || combatModal.phase !== 'rolling') return;
    if (combatModal.attackerDie !== null) {
      setAttackerRolling(true);
      setTimeout(() => setAttackerRolling(false), 700);
    }
  }, [combatModal?.phase === 'rolling' ? (combatModal as any).attackerDie : undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!combatModal || combatModal.phase !== 'rolling') return;
    if (combatModal.defenderDie !== null) {
      setDefenderRolling(true);
      setTimeout(() => setDefenderRolling(false), 700);
    }
  }, [combatModal?.phase === 'rolling' ? (combatModal as any).defenderDie : undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!combatModal) return null;

  if (combatModal.phase === 'rolling') {
    const isAttacker = localPlayerId === combatModal.attackerId;
    const isDefender = localPlayerId === combatModal.defenderId;
    const hasRolled = (isAttacker && combatModal.attackerDie !== null)
      || (isDefender && combatModal.defenderDie !== null);
    const canRoll = (isAttacker || isDefender) && !hasRolled;
    const gameId = gameState?.gameId ?? '';

    const attackerPlayer = gameState?.players.find(p => p.id === combatModal.attackerId);
    const defenderPlayer = gameState?.players.find(p => p.id === combatModal.defenderId);
    const attackerColor = attackerPlayer ? resolvePlayerColor(attackerPlayer.color) : '#ef4444';
    const defenderColor = defenderPlayer ? resolvePlayerColor(defenderPlayer.color) : '#3b82f6';

    return (
      <AnimatePresence>
        <motion.div
          key="combat-rolling"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        >
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-5 w-80 max-w-[90vw]">
            {/* Header */}
            <div className="text-center mb-4">
              <p className="text-sm font-bold text-white">⚔️ Combat!</p>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="font-semibold" style={{ color: attackerColor }}>{combatModal.attackerName}</span>
                <span className="text-gray-500 mx-1">vs</span>
                <span className="font-semibold" style={{ color: defenderColor }}>{combatModal.defenderName}</span>
              </p>
              <p className="text-xs text-yellow-400 mt-1">Each player rolls their die!</p>
            </div>

            {/* Dice row */}
            <div className="flex items-center justify-around mb-4">
              {/* Attacker die */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: attackerColor }}>⚔️ {combatModal.attackerName}</p>
                <Die
                  value={combatModal.attackerDie ?? PIPS_PLACEHOLDER}
                  rolling={attackerRolling}
                  dim={combatModal.attackerDie === null}
                  size={52}
                />
                <p className="text-[10px] text-gray-500">
                  {combatModal.attackerDie !== null ? `Rolled ${combatModal.attackerDie}` : 'Waiting…'}
                </p>
              </div>

              <span className="text-gray-600 font-bold text-lg">VS</span>

              {/* Defender die */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: defenderColor }}>🛡️ {combatModal.defenderName}</p>
                <Die
                  value={combatModal.defenderDie ?? PIPS_PLACEHOLDER}
                  rolling={defenderRolling}
                  dim={combatModal.defenderDie === null}
                  size={52}
                />
                <p className="text-[10px] text-gray-500">
                  {combatModal.defenderDie !== null ? `Rolled ${combatModal.defenderDie}` : 'Waiting…'}
                </p>
              </div>
            </div>

            {/* Roll button / waiting */}
            {canRoll ? (
              <button
                className="w-full rounded-xl bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black font-bold py-3 text-sm transition-all"
                onClick={() => wsService.send({ type: 'COMBAT_ROLL', payload: { gameId } })}
              >
                🎲 Roll your die!
              </button>
            ) : (isAttacker || isDefender) ? (
              <p className="text-center text-xs text-gray-400">Waiting for the other player…</p>
            ) : (
              <p className="text-center text-xs text-gray-400">Waiting for both players to roll…</p>
            )}

            {/* Timeout bar */}
            <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-yellow-500 rounded-full"
                initial={{ width: '100%' }}
                animate={{ width: `${(timeLeft / combatModal.timeoutSecs) * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>
            <p className="text-center text-[10px] text-gray-600 mt-1">Auto-rolls in {timeLeft}s</p>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Result phase
  const r = combatModal;
  const attackerPlayer = gameState?.players.find(p => p.username === r.attackerName);
  const defenderPlayer = gameState?.players.find(p => p.username === r.defenderName);
  const attackerColor = attackerPlayer ? resolvePlayerColor(attackerPlayer.color) : '#ef4444';
  const defenderColor = defenderPlayer ? resolvePlayerColor(defenderPlayer.color) : '#3b82f6';
  const winnerColor = r.attackerWon ? attackerColor : defenderColor;

  const effectLabel = r.attackerWon
    ? r.effect === 'siege' ? '🔴 Siege started!'
    : r.effect === 'destruction_choice' ? '💥 Destruction!'
    : '⚔️ Victory!'
    : '🛡️ Attack repelled!';

  return (
    <AnimatePresence>
      <motion.div
        key="combat-result"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={clearCombatModal}
      >
        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-5 w-80 max-w-[90vw]" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="text-center mb-4">
            <p className="text-xs text-gray-400 mb-0.5">
              <span className="font-semibold" style={{ color: attackerColor }}>{r.attackerName}</span>
              <span className="text-gray-500 mx-1">⚔️</span>
              <span className="font-semibold" style={{ color: defenderColor }}>{r.defenderName}</span>
            </p>
            <p className="text-lg font-bold" style={{ color: winnerColor }}>{effectLabel}</p>
          </div>

          {/* Dice breakdown */}
          <div className="flex items-stretch gap-3 mb-4">
            {/* Attacker */}
            <div className="flex-1 flex flex-col items-center gap-2 rounded-xl p-3" style={{ background: `${attackerColor}18`, border: `1px solid ${attackerColor}40` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: attackerColor }}>⚔️ Attack</p>
              <Die value={r.attackerDie} rolling={false} dim={false} size={44} />
              <div className="text-xs text-center space-y-0.5">
                <p className="text-gray-400">🎲 {r.attackerDie} + 🪖 {r.attackSoldiers}</p>
                <p className="text-white font-bold text-base">= {r.attackerForce}</p>
              </div>
            </div>

            <div className="flex items-center">
              <span className="text-gray-500 font-bold text-sm">VS</span>
            </div>

            {/* Defender */}
            <div className="flex-1 flex flex-col items-center gap-2 rounded-xl p-3" style={{ background: `${defenderColor}18`, border: `1px solid ${defenderColor}40` }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: defenderColor }}>🛡️ Defense</p>
              <Die value={r.defenderDie} rolling={false} dim={false} size={44} />
              <div className="text-xs text-center space-y-0.5">
                <p className="text-gray-400">
                  🎲 {r.defenderDie}
                  {r.defenderSoldiers > 0 && <> + 🪖 {r.defenderSoldiers}</>}
                  {r.cityBonus > 0 && <> + 🏙️{r.cityBonus}</>}
                  {r.garrisonBonus > 0 && <> + 🏰{r.garrisonBonus}</>}
                </p>
                <p className="text-white font-bold text-base">= {r.defenderForce}</p>
              </div>
            </div>
          </div>

          {/* Result bar */}
          <div className="rounded-lg py-2 px-3 text-center text-sm font-semibold mb-2"
            style={{ background: `${winnerColor}25`, color: winnerColor }}>
            {r.attackerForce} vs {r.defenderForce} — {r.attackerWon ? `${r.attackerName} wins` : `${r.defenderName} defends`}
          </div>

          {/* Soldier losses */}
          {(r.attackerSoldierLoss > 0 || r.defenderSoldierLoss > 0) && (
            <div className="flex justify-around text-xs text-gray-400 mb-3">
              {r.attackerSoldierLoss > 0 && (
                <span className="text-red-400">⚔️ {r.attackerName} lost {r.attackerSoldierLoss} 🪖</span>
              )}
              {r.defenderSoldierLoss > 0 && (
                <span className="text-orange-400">🛡️ {r.defenderName} lost {r.defenderSoldierLoss} 🪖</span>
              )}
            </div>
          )}

          <button
            className="w-full rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold py-2 transition-colors"
            onClick={clearCombatModal}
          >
            Continue
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
