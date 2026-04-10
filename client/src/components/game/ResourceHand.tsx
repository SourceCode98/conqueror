/**
 * Resource hand + dev cards — anchored at the top of the screen (below header).
 * Peeks by default; tapping expands downward to show full cards.
 * On desktop, hidden — the sidebar handles resource display.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ResourceBundle, ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES } from '@conqueror/shared';
import type { DevCard } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { RESOURCE_ICON_MAP, DevCardIcon, BanditIcon, RoadIcon } from '../icons/GameIcons.js';
import { cn } from '../../lib/cn.js';

// Must match GamePage HEADER_H constant
export const HAND_HEADER_H = 44;
export const HAND_PEEK_H   = 32;

const CARD_THEME: Record<ResourceType, { bg: string; borderColor: string; label: string }> = {
  timber: { bg: '#0f2e14', borderColor: '#22c55e', label: 'Timber' },
  clay:   { bg: '#3b1004', borderColor: '#f97316', label: 'Clay'   },
  iron:   { bg: '#131c2b', borderColor: '#94a3b8', label: 'Iron'   },
  grain:  { bg: '#2e1d02', borderColor: '#fbbf24', label: 'Grain'  },
  wool:   { bg: '#092b1b', borderColor: '#86efac', label: 'Wool'   },
};

const DEV_META: Record<string, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  warrior:      { bg: '#0c1a2e', border: '#3b82f6', icon: <BanditIcon size={20} color="#93c5fd"/>, label: 'Warrior' },
  roadBuilding: { bg: '#2c1a04', border: '#fcd34d', icon: <RoadIcon size={20} color="#fcd34d"/>,   label: 'Road ×2' },
  yearOfPlenty: { bg: '#0a2a14', border: '#86efac', icon: <span className="text-lg">🌟</span>,      label: 'Year of Plenty' },
  monopoly:     { bg: '#1a0a2e', border: '#c084fc', icon: <span className="text-lg">💰</span>,      label: 'Monopoly' },
  victoryPoint: { bg: '#2e2200', border: '#fbbf24', icon: <span className="text-lg">⭐</span>,      label: 'Vic. Point' },
};

const CARD_W    = 64;
const CARD_H    = 90;
const CARD_W_SM = 50;
const CARD_H_SM = 70;
const STACK_OFFSET = 3;

function ResourceCard({ resource, count, small }: { resource: ResourceType; count: number; small?: boolean }) {
  const theme = CARD_THEME[resource];
  const stackLayers = Math.min(count - 1, 3);
  const cw = small ? CARD_W_SM : CARD_W;
  const ch = small ? CARD_H_SM : CARD_H;
  return (
    <div className="relative flex-shrink-0" style={{ width: cw, height: ch + stackLayers * STACK_OFFSET }}>
      {Array.from({ length: stackLayers }, (_, i) => (
        <div key={i} className="absolute rounded-xl"
          style={{
            width: cw, height: ch,
            top: i * STACK_OFFSET,
            left: (stackLayers - 1 - i) * 1,
            backgroundColor: theme.bg,
            border: `1.5px solid ${theme.borderColor}`,
            opacity: 0.25 + i * 0.2,
            zIndex: i,
          }}
        />
      ))}
      <div className="absolute rounded-xl flex flex-col overflow-hidden"
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
        <div className="flex items-start justify-between px-1.5 pt-1">
          <span className="text-[11px] font-bold tabular-nums" style={{ color: theme.borderColor }}>{count}</span>
          <div className="opacity-20">{RESOURCE_ICON_MAP[resource]?.({ size: 10 })}</div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          {RESOURCE_ICON_MAP[resource]?.({ size: small ? 26 : 34 })}
        </div>
        <div className="text-center py-1 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: theme.borderColor, background: `linear-gradient(transparent, rgba(0,0,0,0.4))` }}>
          {theme.label}
        </div>
      </div>
    </div>
  );
}

function DevCardMini({ card, small }: { card: DevCard; small?: boolean }) {
  const meta = DEV_META[card.type] ?? DEV_META.victoryPoint;
  const used = card.playedThisTurn || card.boughtThisTurn;
  const cw = small ? 44 : 56;
  const ch = small ? 64 : 80;
  return (
    <div
      className={cn('relative rounded-xl border flex flex-col items-center overflow-hidden shrink-0', used ? 'opacity-40 grayscale' : '')}
      style={{ width: cw, height: ch, backgroundColor: meta.bg, borderColor: meta.border }}
    >
      <div className="w-full h-1.5" style={{ backgroundColor: meta.border, opacity: 0.6 }}/>
      <div className="flex-1 flex items-center justify-center py-1">{meta.icon}</div>
      <div className="w-full text-center pb-1 px-0.5 text-[8px] font-bold leading-tight" style={{ color: meta.border }}>{meta.label}</div>
      {card.boughtThisTurn && <span className="absolute top-0.5 right-0.5 text-[7px] bg-green-700 text-white rounded px-0.5">NEW</span>}
      {card.playedThisTurn  && <span className="absolute top-0.5 right-0.5 text-[7px] bg-gray-700 text-gray-400 rounded px-0.5">USED</span>}
    </div>
  );
}

interface Props {
  resources: ResourceBundle;
  devCards?: DevCard[];
}

export default function ResourceHand({ resources, devCards }: Props) {
  const [pinned, setPinned]   = useState(false);
  const [hovering, setHovering] = useState(false);
  const [small, setSmall]     = useState(() => window.innerWidth < 640);
  const [tab, setTab]         = useState<'resources' | 'devcards'>('resources');
  const { tradePanel, tradeSide, _tradeCardCb } = useGameStore();

  useEffect(() => {
    const check = () => setSmall(window.innerWidth < 640);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const held      = ALL_RESOURCES.filter(r => resources[r] > 0);
  const total     = ALL_RESOURCES.reduce((s, r) => s + resources[r], 0);
  const devCount  = devCards?.length ?? 0;
  const tradeOpen = tradePanel !== null;
  const expanded  = pinned || hovering || tradeOpen;

  const cardH = small ? CARD_H_SM : CARD_H;
  const cardW = small ? CARD_W_SM : CARD_W;

  // Height of the content area below the peek bar
  const cardsH = cardH + STACK_OFFSET * 3 + 28;  // cards + stack + padding
  const tradeH = 72;                               // compact trade strip
  const devH   = (small ? 64 : 80) + 28;          // dev card + padding
  const contentH = tradeOpen ? tradeH : (tab === 'devcards' ? devH : cardsH);

  // Width: wide enough to fit all cards
  const minW = tradeOpen
    ? Math.min(360, window.innerWidth - 16)
    : Math.max(small ? 200 : 260, held.length * (cardW + 10) + 48);

  return (
    <motion.div
      className="lg:hidden fixed left-1/2 z-50 overflow-hidden rounded-b-2xl border-x border-b border-gray-700 shadow-2xl"
      style={{ top: HAND_HEADER_H, translateX: '-50%', maxWidth: 'calc(100vw - 8px)', width: minW }}
      animate={{ height: expanded ? HAND_PEEK_H + contentH : HAND_PEEK_H }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      onHoverStart={() => setHovering(true)}
      onHoverEnd={() => setHovering(false)}
    >
      {/* ── Peek / tab bar ── */}
      <div
        className={cn(
          'flex items-center justify-center gap-2 px-3 cursor-pointer select-none transition-colors',
          expanded ? 'bg-gray-800' : 'bg-gray-900/95',
        )}
        style={{ height: HAND_PEEK_H }}
        onClick={() => { if (!tradeOpen) setPinned(p => !p); }}
      >
        <button
          className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded transition-colors',
            tab === 'resources' ? 'text-white bg-gray-700' : 'text-gray-500 hover:text-gray-300')}
          onClick={e => { e.stopPropagation(); setTab('resources'); }}
        >
          {expanded ? '▴' : '▾'} Hand
        </button>
        <span className={cn('text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-full',
          total > 0 ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400')}>
          {total}
        </span>
        {devCount > 0 && (
          <>
            <div className="w-px h-3 bg-gray-600"/>
            <button
              className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded flex items-center gap-1 transition-colors',
                tab === 'devcards' ? 'text-white bg-gray-700' : 'text-gray-500 hover:text-gray-300')}
              onClick={e => { e.stopPropagation(); setTab('devcards'); if (!expanded) setPinned(true); }}
            >
              <DevCardIcon size={10} color="currentColor"/> {devCount}
            </button>
          </>
        )}
        {tradeOpen && (
          <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded',
            tradeSide === 'give' ? 'bg-amber-700 text-amber-200' : 'bg-green-800 text-green-200')}>
            {tradeSide === 'give' ? '↑ Give' : '↓ Want'}
          </span>
        )}
        {pinned && !tradeOpen && (
          <span className="text-[9px] text-amber-400 font-medium">pinned</span>
        )}
      </div>

      {/* ── Cards content ── */}
      {tradeOpen ? (
        /* Compact trade strip */
        <div className="bg-gray-900 px-3 pt-2 pb-3 flex items-center justify-center gap-2 flex-wrap" style={{ height: tradeH }}>
          {held.length === 0 ? (
            <span className="text-gray-600 text-xs">No resources</span>
          ) : held.map(r => {
            const theme = CARD_THEME[r];
            return (
              <button key={r}
                onClick={_tradeCardCb ? () => _tradeCardCb(r) : undefined}
                className="relative flex flex-col items-center rounded-xl border px-2 py-1 hover:scale-110 active:scale-95 transition-transform select-none"
                style={{ backgroundColor: theme.bg, borderColor: theme.borderColor, minWidth: 44 }}
              >
                {RESOURCE_ICON_MAP[r]?.({ size: 24 })}
                <span className="text-[9px] font-bold mt-0.5" style={{ color: theme.borderColor }}>{resources[r]}×</span>
                <span className="text-[7px] uppercase" style={{ color: theme.borderColor, opacity: 0.7 }}>{theme.label}</span>
              </button>
            );
          })}
        </div>
      ) : tab === 'resources' ? (
        /* Resource cards — flat row */
        <div className="bg-gray-900 px-4 pt-3 pb-4 flex items-end justify-center gap-2.5 flex-nowrap overflow-x-auto">
          {held.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm w-full">No resources</div>
          ) : held.map(r => (
            <ResourceCard key={r} resource={r} count={resources[r]} small={small}/>
          ))}
        </div>
      ) : (
        /* Dev cards tab */
        <div className="bg-gray-900 px-4 pt-3 pb-4 flex items-center justify-center gap-2 overflow-x-auto">
          {!devCards || devCards.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm w-full">No dev cards</div>
          ) : devCards.map((card, i) => (
            <DevCardMini key={i} card={card} small={small}/>
          ))}
        </div>
      )}
    </motion.div>
  );
}
