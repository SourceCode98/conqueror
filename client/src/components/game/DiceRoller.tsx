import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { cn } from '../../lib/cn.js';
import { safePlay, playDiceSound } from './SoundPanel.js';

export type DiceAnimState = 'idle' | 'rolling' | 'showing';

/** Reusable hook: drives dice animation when diceRoll changes */
export function useDiceAnimation(diceRoll: [number, number] | null, phase: string) {
  const [animState, setAnimState] = useState<DiceAnimState>('idle');
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  const prevPhase = useRef(phase);

  useEffect(() => {
    const d0 = diceRoll?.[0];
    const d1 = diceRoll?.[1];
    if (!d0 || !d1) return;
    setAnimState('rolling');
    safePlay(playDiceSound);
    let ticks = 0;
    const id = setInterval(() => {
      ticks++;
      if (ticks < 20) {
        setFaces([(Math.floor(Math.random() * 6) + 1) as 1, (Math.floor(Math.random() * 6) + 1) as 1]);
      } else {
        clearInterval(id);
        setFaces([d0, d1]);
        setAnimState('showing');
      }
    }, 65);
    return () => clearInterval(id);
  }, [diceRoll?.[0], diceRoll?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prevPhase.current !== 'ROLL' && phase === 'ROLL') {
      setAnimState('idle');
      setFaces([1, 1]);
    }
    prevPhase.current = phase;
  }, [phase]);

  return { animState, faces };
}

interface Props {
  diceRoll: [number, number] | null;
  phase: string;
  isMyTurn: boolean;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
};

export function Die({ value, rolling, dim, size = 48 }: { value: number; rolling: boolean; dim: boolean; size?: number }) {
  const controls = useAnimation();
  const pips = PIPS[Math.max(1, Math.min(6, value))] ?? PIPS[1];
  const isHot = value === 6 || value === 8;

  useEffect(() => {
    if (rolling) {
      controls.start({
        rotate: [0, -20, 24, -14, 18, -8, 12, 0],
        scale:  [1, 1.14, 0.92, 1.09, 0.96, 1.05, 0.98, 1],
        transition: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' },
      });
    } else {
      controls.stop();
      controls.set({ rotate: 0, scale: 1 });
    }
  }, [rolling, controls]);

  const pip = Math.round(size / 5);
  return (
    <motion.div
      animate={controls}
      className={cn(
        'relative rounded-xl shadow-md border-2 select-none flex-shrink-0',
        dim ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-100',
      )}
      style={{ width: size, height: size, opacity: dim ? 0.35 : 1 }}
    >
      {pips.map(([px, py], i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: pip, height: pip,
            left: `${px}%`, top: `${py}%`,
            transform: 'translate(-50%,-50%)',
            backgroundColor: dim ? '#666' : isHot ? '#dc2626' : '#111827',
          }}
        />
      ))}
    </motion.div>
  );
}

export default function DiceRoller({ diceRoll, phase, isMyTurn }: Props) {
  const { animState, faces } = useDiceAnimation(diceRoll, phase);
  const rolling    = animState === 'rolling';
  const showing    = animState === 'showing';
  const awaitRoll  = phase === 'ROLL' && isMyTurn;
  const dim        = animState === 'idle' && !diceRoll;
  const total      = showing ? faces[0] + faces[1] : diceRoll ? diceRoll[0] + diceRoll[1] : null;

  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 flex flex-col items-center gap-2 transition-colors',
        awaitRoll ? 'border-amber-500 bg-gray-800 animate-[pulse-ring_2s_ease-in-out_infinite]'
                  : 'border-gray-700 bg-gray-800/50',
      )}
    >
      <div className="flex items-center gap-4">
        <Die value={faces[0]} rolling={rolling} dim={dim}/>
        <Die value={faces[1]} rolling={rolling} dim={dim}/>
      </div>

      <AnimatePresence mode="wait">
        {rolling && (
          <motion.p key="r"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="text-xs text-gray-400">Rolling…</motion.p>
        )}
        {showing && total !== null && (
          <motion.div key="s"
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 440, damping: 22 }}
            className="flex flex-col items-center"
          >
            <span className="text-3xl font-bold tabular-nums leading-none"
              style={{ color: total === 7 ? '#ef4444' : (total === 6 || total === 8) ? '#f97316' : '#f59e0b' }}>
              {total}
            </span>
            {total === 7 && <span className="text-[11px] text-red-400 font-semibold mt-0.5">Move the Bandit!</span>}
          </motion.div>
        )}
        {!rolling && !showing && awaitRoll && (
          <motion.p key="a"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-xs text-amber-400 font-medium">🎲 Your turn — roll!</motion.p>
        )}
        {!rolling && !showing && !awaitRoll && diceRoll && (
          <motion.p key="p"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[11px] text-gray-500 tabular-nums">
            Last roll: {diceRoll[0] + diceRoll[1]}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
