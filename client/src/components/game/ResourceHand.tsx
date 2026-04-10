/**
 * Poker-style resource hand — fixed at the bottom of the screen.
 * Peeks by default; slides up on hover or stays open when pinned (click).
 * When a trade panel is open, cards become clickable trade inputs.
 * Only rendered for the local player.
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import type { ResourceBundle, ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';
import { cn } from '../../lib/cn.js';

const CARD_THEME: Record<ResourceType, { bg: string; borderColor: string; label: string }> = {
  timber: { bg: '#0f2e14', borderColor: '#22c55e', label: 'Timber' },
  clay:   { bg: '#3b1004', borderColor: '#f97316', label: 'Clay'   },
  iron:   { bg: '#131c2b', borderColor: '#94a3b8', label: 'Iron'   },
  grain:  { bg: '#2e1d02', borderColor: '#fbbf24', label: 'Grain'  },
  wool:   { bg: '#092b1b', borderColor: '#86efac', label: 'Wool'   },
};

const CARD_W = 72;
const CARD_H = 102;
const CARD_W_SM = 54;
const CARD_H_SM = 76;
const STACK_OFFSET = 4;
const PEEK_HEIGHT = 32;
const TRADE_STRIP_H = 96;

function ResourceCard({ resource, count, small }: { resource: ResourceType; count: number; small?: boolean }) {
  const theme = CARD_THEME[resource];
  const stackLayers = Math.min(count - 1, 3);
  const cw = small ? CARD_W_SM : CARD_W;
  const ch = small ? CARD_H_SM : CARD_H;

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: cw, height: ch + stackLayers * STACK_OFFSET }}
    >
      {/* Shadow cards behind */}
      {Array.from({ length: stackLayers }, (_, i) => (
        <div key={i} className="absolute rounded-2xl"
          style={{
            width: cw, height: ch,
            top: (stackLayers - 1 - i) * STACK_OFFSET,
            left: (stackLayers - 1 - i) * 1,
            backgroundColor: theme.bg,
            border: `1.5px solid ${theme.borderColor}`,
            opacity: 0.25 + i * 0.2,
            zIndex: i,
          }}
        />
      ))}

      {/* Foreground card */}
      <div
        className="absolute rounded-2xl flex flex-col overflow-hidden"
        style={{
          width: cw, height: ch,
          top: stackLayers * STACK_OFFSET,
          left: 0,
          backgroundColor: theme.bg,
          border: `1.5px solid ${theme.borderColor}`,
          boxShadow: `0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)`,
          zIndex: stackLayers + 1,
        }}
      >
        {/* Corner index */}
        <div className="flex items-start justify-between px-1.5 pt-1">
          <div className="flex flex-col items-center leading-none">
            <span className="text-[11px] font-bold tabular-nums leading-none" style={{ color: theme.borderColor }}>
              {count}
            </span>
            <span className="text-[7px]" style={{ color: theme.borderColor, opacity: 0.5 }}>◆</span>
          </div>
          <div className="opacity-20">
            {RESOURCE_ICON_MAP[resource]?.({ size: 10 })}
          </div>
        </div>

        {/* Center icon */}
        <div className="flex-1 flex items-center justify-center">
          {RESOURCE_ICON_MAP[resource]?.({ size: small ? 28 : 38 })}
        </div>

        {/* Bottom label */}
        <div className="text-center py-1 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: theme.borderColor, background: `linear-gradient(transparent, rgba(0,0,0,0.4))` }}>
          {theme.label}
        </div>
      </div>
    </div>
  );
}

interface Props {
  resources: ResourceBundle;
}

export default function ResourceHand({ resources }: Props) {
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [small, setSmall] = useState(() => window.innerWidth < 640);
  const { tradePanel, tradeSide, _tradeCardCb } = useGameStore();

  useEffect(() => {
    const check = () => setSmall(window.innerWidth < 640);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const held = ALL_RESOURCES.filter(r => resources[r] > 0);
  const total = ALL_RESOURCES.reduce((s, r) => s + resources[r], 0);

  const tradeOpen = tradePanel !== null;
  const expanded = pinned || hovering || tradeOpen;

  const cardW = small ? CARD_W_SM : CARD_W;
  const cardH = small ? CARD_H_SM : CARD_H;

  function fanAngle(idx: number, len: number): number {
    if (len <= 1) return 0;
    const spread = Math.min(16, len * 2.5);
    return ((idx / (len - 1)) - 0.5) * spread;
  }

  return (
    <motion.div
      className="fixed bottom-0 left-1/2 z-50"
      style={{ translateX: '-50%' }}
      onHoverStart={() => setHovering(true)}
      onHoverEnd={() => setHovering(false)}
      animate={{ y: expanded ? 0 : cardH + STACK_OFFSET * 3 - PEEK_HEIGHT }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      {/* Toggle / peek bar */}
      <div
        className={cn(
          'flex items-center justify-center gap-3 rounded-t-2xl px-6 cursor-pointer select-none border-x border-t transition-colors',
          expanded ? 'bg-gray-800 border-gray-600' : 'bg-gray-900/90 border-gray-700',
        )}
        style={{ height: PEEK_HEIGHT }}
        onClick={() => { if (!tradeOpen) setPinned(p => !p); }}
      >
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          {expanded ? '▾ Your Hand' : '▴ Your Hand'}
        </span>
        <span className={cn(
          'text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-full',
          total > 0 ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400',
        )}>
          {total}
        </span>
        {tradeOpen && (
          <span className={cn(
            'text-[9px] font-semibold px-1.5 py-0.5 rounded',
            tradeSide === 'give' ? 'bg-amber-700 text-amber-200' : 'bg-green-800 text-green-200',
          )}>
            {tradeSide === 'give' ? '↑ Give' : '↓ Want'}
          </span>
        )}
        {pinned && !tradeOpen && (
          <span className="text-[9px] text-amber-400 font-medium">pinned</span>
        )}
      </div>

      {/* Cards container */}
      {tradeOpen ? (
        /* Compact strip — tappable chips when trade panel is open */
        <div
          className="bg-gray-900/95 border-x border-gray-700 px-4 pb-3 pt-2 backdrop-blur-sm flex items-center justify-center gap-2"
          style={{ height: TRADE_STRIP_H - PEEK_HEIGHT }}
        >
          {held.length === 0 ? (
            <span className="text-gray-600 text-xs">No resources</span>
          ) : (
            held.map(r => {
              const theme = CARD_THEME[r];
              return (
                <button
                  key={r}
                  onClick={_tradeCardCb ? () => _tradeCardCb(r) : undefined}
                  className="relative flex flex-col items-center rounded-xl border px-2 py-1.5 hover:scale-110 active:scale-95 transition-transform select-none"
                  style={{ backgroundColor: theme.bg, borderColor: theme.borderColor, minWidth: 48 }}
                >
                  {RESOURCE_ICON_MAP[r]?.({ size: 28 })}
                  <span className="text-[9px] font-bold mt-0.5" style={{ color: theme.borderColor }}>
                    {resources[r]}×
                  </span>
                  <span className="text-[7px] uppercase" style={{ color: theme.borderColor, opacity: 0.7 }}>
                    {theme.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : (
        /* Full poker hand — normal mode */
        <div
          className="bg-gray-900/95 border-x border-gray-700 px-8 pb-4 pt-3 backdrop-blur-sm"
          style={{ minWidth: Math.max(small ? 240 : 320, held.length * (cardW + 12) + 64), maxWidth: '100dvw' }}
        >
          {held.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm">No resources</div>
          ) : (
            <div className="flex items-end justify-center gap-3">
              {held.map((r, i) => (
                <motion.div
                  key={r}
                  style={{ transformOrigin: 'bottom center' }}
                  animate={{ rotate: fanAngle(i, held.length) }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  whileHover={{ rotate: 0, scale: 1.08, zIndex: 10 }}
                >
                  <ResourceCard resource={r} count={resources[r]} small={small}/>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
