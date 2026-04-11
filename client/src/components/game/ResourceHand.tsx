/**
 * Resource hand + dev cards — draggable to any screen edge.
 * Each edge has 3 snap points (start / center / end).
 * On desktop, hidden — the sidebar handles resource display.
 */
import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import type { ResourceBundle, ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES } from '@conqueror/shared';
import type { DevCard } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { RESOURCE_ICON_MAP, DevCardIcon, BanditIcon, RoadIcon } from '../icons/GameIcons.js';
import { cn } from '../../lib/cn.js';

export const HAND_HEADER_H = 44;
export const HAND_PEEK_H   = 32;

// 12 anchor positions: 3 per edge
export type HandAnchor =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'left-top'    | 'left-center'   | 'left-bottom'
  | 'right-top'   | 'right-center'  | 'right-bottom';

type Edge = 'top' | 'bottom' | 'left' | 'right';
type Pos  = 'left' | 'center' | 'right' | 'top' | 'bottom';

function anchorEdge(a: HandAnchor): Edge { return a.split('-')[0] as Edge; }
function anchorPos(a: HandAnchor): Pos   { return a.split('-')[1] as Pos;  }

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
const MIN_DRAG_PX  = 12;
const SIDE_PEEK_W  = 32;

export function ResourceCard({ resource, count, small }: { resource: ResourceType; count: number; small?: boolean }) {
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

export function DevCardMini({ card, small }: { card: DevCard; small?: boolean }) {
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

// ── Snap logic ──────────────────────────────────────────────────────────────

function calcNearestAnchor(x: number, y: number): HandAnchor {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dists = { top: y, bottom: h - y, left: x, right: w - x };
  const edge = (Object.keys(dists) as Edge[]).reduce((a, b) => dists[a] <= dists[b] ? a : b);

  if (edge === 'top' || edge === 'bottom') {
    const seg = w / 3;
    const pos = x < seg ? 'left' : x < 2 * seg ? 'center' : 'right';
    return `${edge}-${pos}` as HandAnchor;
  } else {
    const seg = h / 3;
    const pos = y < seg ? 'top' : y < 2 * seg ? 'center' : 'bottom';
    return `${edge}-${pos}` as HandAnchor;
  }
}

// ── Anchor guides — all 12 snap points shown during drag ────────────────────

const ALL_ANCHORS: HandAnchor[] = [
  'top-left', 'top-center', 'top-right',
  'bottom-left', 'bottom-center', 'bottom-right',
  'left-top', 'left-center', 'left-bottom',
  'right-top', 'right-center', 'right-bottom',
];

function AnchorGuides({ activeAnchor }: { activeAnchor: HandAnchor }) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const segW = w / 3;
  const segH = h / 3;
  const GAP = 3; // gap between segments in px

  return (
    <>
      {ALL_ANCHORS.map(a => {
        const edge = anchorEdge(a);
        const pos  = anchorPos(a);
        const isH  = edge === 'top' || edge === 'bottom';
        const active = a === activeAnchor;

        const style: React.CSSProperties = {
          position: 'fixed',
          pointerEvents: 'none',
          borderRadius: 4,
          transition: 'background 0.1s, opacity 0.1s',
          background: active ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'rgba(255,255,255,0.18)',
          boxShadow: active ? '0 0 8px 2px rgba(251,191,36,0.5)' : 'none',
          opacity: active ? 1 : 0.55,
          zIndex: 49,
        };

        if (isH) {
          const left = pos === 'left' ? GAP : pos === 'center' ? segW + GAP : 2 * segW + GAP;
          Object.assign(style, {
            [edge]: 4,
            left,
            width: segW - GAP * 2,
            height: active ? 6 : 4,
          });
        } else {
          const top = pos === 'top' ? GAP : pos === 'center' ? segH + GAP : 2 * segH + GAP;
          Object.assign(style, {
            [edge]: 4,
            top,
            width: active ? 6 : 4,
            height: segH - GAP * 2,
          });
        }

        return <div key={a} style={style} />;
      })}
    </>
  );
}

// ── Positioning helpers ─────────────────────────────────────────────────────

const BOTTOM_OFFSET = 56 + 44; // ContextBar + chat bar

function getPanelStyle(anchor: HandAnchor, contentW: number, panelSideH: number, isDragging: boolean): React.CSSProperties {
  const edge = anchorEdge(anchor);
  const pos  = anchorPos(anchor);
  const opacity = isDragging ? 0.7 : 1;
  const w = Math.min(contentW, window.innerWidth - 8);

  switch (edge) {
    case 'top': {
      const top = HAND_HEADER_H;
      if (pos === 'left')   return { top, left: 0, width: w, opacity };
      if (pos === 'right')  return { top, right: 0, width: w, opacity };
      return { top, left: '50%', transform: 'translateX(-50%)', width: w, opacity };
    }
    case 'bottom': {
      const bottom = BOTTOM_OFFSET;
      if (pos === 'left')   return { bottom, left: 0, width: w, opacity };
      if (pos === 'right')  return { bottom, right: 0, width: w, opacity };
      return { bottom, left: '50%', transform: 'translateX(-50%)', width: w, opacity };
    }
    case 'left': {
      if (pos === 'top')    return { left: 0, top: HAND_HEADER_H, height: panelSideH, opacity };
      if (pos === 'bottom') return { left: 0, bottom: BOTTOM_OFFSET, height: panelSideH, opacity };
      return { left: 0, top: '50%', transform: 'translateY(-50%)', height: panelSideH, opacity };
    }
    case 'right': {
      if (pos === 'top')    return { right: 0, top: HAND_HEADER_H, height: panelSideH, opacity };
      if (pos === 'bottom') return { right: 0, bottom: BOTTOM_OFFSET, height: panelSideH, opacity };
      return { right: 0, top: '50%', transform: 'translateY(-50%)', height: panelSideH, opacity };
    }
  }
}

function getBorderClass(anchor: HandAnchor): string {
  const edge = anchorEdge(anchor);
  const pos  = anchorPos(anchor);

  if (edge === 'top') {
    if (pos === 'left')   return 'rounded-br-2xl border-r border-b';
    if (pos === 'right')  return 'rounded-bl-2xl border-l border-b';
    return 'rounded-b-2xl border-x border-b';
  }
  if (edge === 'bottom') {
    if (pos === 'left')   return 'rounded-tr-2xl border-r border-t';
    if (pos === 'right')  return 'rounded-tl-2xl border-l border-t';
    return 'rounded-t-2xl border-x border-t';
  }
  // left / right — always rounded on the open side
  if (edge === 'left')  return 'rounded-r-2xl border-y border-r';
  return 'rounded-l-2xl border-y border-l';
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  resources: ResourceBundle;
  devCards?: DevCard[];
}

export default function ResourceHand({ resources, devCards }: Props) {
  const [anchor, setAnchor] = useState<HandAnchor>(() => {
    try { return (localStorage.getItem('hand-anchor') as HandAnchor) ?? 'top-center'; } catch { return 'top-center'; }
  });
  const [pinned, setPinned]     = useState(false);
  const [hovering, setHovering] = useState(false);
  const [small, setSmall]       = useState(() => window.innerWidth < 640);
  const [tab, setTab]           = useState<'resources' | 'devcards'>('resources');
  const [isDragging, setIsDragging] = useState(false);
  const [ghostAnchor, setGhostAnchor] = useState<HandAnchor | null>(null);
  const { tradePanel, tradeSide, _tradeCardCb } = useGameStore();

  const isDraggingRef   = useRef(false);
  const ghostAnchorRef  = useRef<HandAnchor | null>(null);

  useEffect(() => {
    const check = () => setSmall(window.innerWidth < 640);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => { setPinned(false); setHovering(false); }, [anchor]);

  const held      = ALL_RESOURCES.filter(r => resources[r] > 0);
  const total     = ALL_RESOURCES.reduce((s, r) => s + resources[r], 0);
  const devCount  = devCards?.length ?? 0;
  const tradeOpen = false;
  const expanded  = pinned || hovering || tradeOpen;

  const cardH = small ? CARD_H_SM : CARD_H;
  const cardW = small ? CARD_W_SM : CARD_W;

  const cardsH    = cardH + STACK_OFFSET * 3 + 28;
  const tradeH    = 72;
  const devH      = (small ? 64 : 80) + 28;
  const contentH  = tradeOpen ? tradeH : (tab === 'devcards' ? devH : cardsH);
  // Ensure the panel is always wide enough for the peek bar buttons
  const peekBarMinW = 240;
  const contentW  = Math.min(
    Math.max(peekBarMinW, small ? 220 : 280, held.length * (cardW + 10) + 48),
    window.innerWidth - 8,
  );
  // For left/right: always include a tab bar row inside the content
  const SIDE_TAB_H = 30;
  const panelSideH = cardsH + HAND_PEEK_H + SIDE_TAB_H;

  const edge       = anchorEdge(anchor);
  const isHorizontal = edge === 'top' || edge === 'bottom';

  const animateProp = isHorizontal
    ? { height: expanded ? HAND_PEEK_H + contentH : HAND_PEEK_H }
    : { width:  expanded ? SIDE_PEEK_W + contentW : SIDE_PEEK_W };

  // ── Drag handling ───────────────────────────────────────────────────────────
  function handlePeekPointerDown(e: React.PointerEvent) {
    const start = { x: e.clientX, y: e.clientY };

    const onMove = (me: PointerEvent) => {
      if (!isDraggingRef.current) {
        if (Math.hypot(me.clientX - start.x, me.clientY - start.y) >= MIN_DRAG_PX) {
          isDraggingRef.current = true;
          setIsDragging(true);
        }
      }
      if (isDraggingRef.current) {
        const a = calcNearestAnchor(me.clientX, me.clientY);
        ghostAnchorRef.current = a;
        setGhostAnchor(a);
      }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (isDraggingRef.current && ghostAnchorRef.current) {
        const next = ghostAnchorRef.current;
        setAnchor(next);
        try { localStorage.setItem('hand-anchor', next); } catch {}
        window.dispatchEvent(new CustomEvent('hand-anchor-change', { detail: next }));
      }
      isDraggingRef.current  = false;
      ghostAnchorRef.current = null;
      setIsDragging(false);
      setGhostAnchor(null);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // ── Content area ─────────────────────────────────────────────────────────────
  const contentArea = tradeOpen ? (
    <div className="px-3 pt-2 pb-3 flex items-center justify-center gap-2 flex-wrap no-scrollbar overflow-x-auto" style={{ minHeight: tradeH }}>
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
    <div className="flex-1 px-4 pt-3 pb-4 flex items-end justify-center gap-2.5 flex-nowrap no-scrollbar overflow-x-auto">
      {held.length === 0 ? (
        <div className="text-center py-4 text-gray-500 text-sm w-full">No resources</div>
      ) : held.map(r => (
        <ResourceCard key={r} resource={r} count={resources[r]} small={small}/>
      ))}
    </div>
  ) : (
    <div className="flex-1 px-4 pt-3 pb-4 flex items-center justify-center gap-2 no-scrollbar overflow-x-auto">
      {!devCards || devCards.length === 0 ? (
        <div className="text-center py-4 text-gray-500 text-sm w-full">No dev cards</div>
      ) : devCards.map((card, i) => (
        <DevCardMini key={i} card={card} small={small}/>
      ))}
    </div>
  );

  // ── Peek bars ────────────────────────────────────────────────────────────────
  const expandArrow = edge === 'bottom'
    ? (expanded ? '▾' : '▴')
    : (expanded ? '▴' : '▾');

  const horizontalPeekBar = (
    <div
      className={cn(
        'flex items-center justify-center gap-1 px-2 transition-colors',
        expanded ? 'bg-gray-800' : 'bg-gray-900/95',
      )}
      style={{ height: HAND_PEEK_H, flexShrink: 0 }}
    >
      {/* Drag handle — ONLY this initiates the drag */}
      <span
        className="text-gray-500 text-[14px] px-1 cursor-grab active:cursor-grabbing self-stretch flex items-center select-none touch-none"
        onPointerDown={handlePeekPointerDown}
      >⠿</span>

      {/* Resources tab button */}
      <button
        className={cn(
          'flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded transition-colors',
          'min-h-[26px]',
          tab === 'resources' ? 'text-white bg-gray-700' : 'text-gray-500 hover:text-gray-300',
        )}
        onClick={() => { setTab('resources'); if (!expanded && !tradeOpen) setPinned(true); }}
      >
        {expandArrow} Hand
      </button>

      {/* Total badge */}
      <span className={cn('text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full pointer-events-none select-none',
        total > 0 ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400')}>
        {total}
      </span>

      {/* Dev cards tab button — always visible */}
      <>
        <div className="w-px h-4 bg-gray-600 pointer-events-none"/>
        <button
          className={cn(
            'flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded transition-colors',
            'min-h-[26px]',
            tab === 'devcards' ? 'text-white bg-gray-700' : 'text-gray-500 hover:text-gray-300',
          )}
          onClick={() => { setTab('devcards'); if (!expanded) setPinned(true); }}
        >
          <DevCardIcon size={11} color="currentColor"/> {devCount}
        </button>
      </>

      {tradeOpen && (
        <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded pointer-events-none select-none',
          tradeSide === 'give' ? 'bg-amber-700 text-amber-200' : 'bg-green-800 text-green-200')}>
          {tradeSide === 'give' ? '↑ Give' : '↓ Want'}
        </span>
      )}
      {pinned && !tradeOpen && (
        <span className="text-[9px] text-amber-400 font-medium pointer-events-none select-none">●</span>
      )}
    </div>
  );

  // For vertical peek bar: tapping the resource badge switches to resources tab (and expands),
  // tapping the dev card badge switches to dev cards tab (and expands).
  function handleVertexTabTap(targetTab: 'resources' | 'devcards') {
    if (tradeOpen) return;
    if (expanded && tab === targetTab) {
      setPinned(false); // collapse if already on this tab
    } else {
      setTab(targetTab);
      setPinned(true);
    }
  }

  const verticalPeekBar = (
    <div
      className={cn(
        'flex flex-col items-center gap-2 py-2 transition-colors',
        expanded ? 'bg-gray-800' : 'bg-gray-900/95',
      )}
      style={{ width: SIDE_PEEK_W, flexShrink: 0 }}
    >
      {/* Drag handle — ONLY this initiates the drag */}
      <span
        className="text-gray-500 text-[14px] cursor-grab active:cursor-grabbing select-none touch-none mt-1"
        onPointerDown={handlePeekPointerDown}
      >⠿</span>

      {/* Resource tab button */}
      <button
        className={cn(
          'flex flex-col items-center gap-0.5 w-full px-1 py-1.5 rounded transition-colors',
          expanded && tab === 'resources' ? 'bg-gray-700' : 'hover:bg-gray-700/50',
        )}
        
        onClick={() => handleVertexTabTap('resources')}
      >
        <span className={cn('text-[10px] font-bold tabular-nums px-1 py-0.5 rounded-full',
          total > 0 ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400')}>
          {total}
        </span>
        <span
          className="text-[8px] font-bold uppercase tracking-widest text-gray-500 leading-none"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: edge === 'right' ? 'rotate(180deg)' : undefined }}
        >
          Hand
        </span>
      </button>

      {/* Dev cards tab button — always visible */}
      <button
        className={cn(
          'flex flex-col items-center gap-0.5 w-full px-1 py-1.5 rounded transition-colors',
          expanded && tab === 'devcards' ? 'bg-gray-700' : 'hover:bg-gray-700/50',
        )}
        onClick={() => handleVertexTabTap('devcards')}
      >
        <span className={cn(
          'text-[10px] font-bold tabular-nums px-1 py-0.5 rounded-full',
          devCount > 0 ? 'text-blue-400 bg-blue-900/60' : 'text-gray-500 bg-gray-700',
        )}>
          {devCount}
        </span>
        <span
          className={cn(
            'text-[8px] font-bold uppercase tracking-widest leading-none',
            devCount > 0 ? 'text-blue-400/70' : 'text-gray-600',
          )}
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: edge === 'right' ? 'rotate(180deg)' : undefined }}
        >
          Dev
        </span>
      </button>

      {pinned && !tradeOpen && <span className="text-[8px] text-amber-400 mt-auto mb-1">●</span>}
    </div>
  );

  // flex direction: top→column, bottom→column-reverse, left→row, right→row-reverse
  const flexDir: React.CSSProperties['flexDirection'] =
    edge === 'bottom' ? 'column-reverse' :
    edge === 'left'   ? 'row'            :
    edge === 'right'  ? 'row-reverse'    : 'column';

  return (
    <>
      {/* All 12 anchor guides — visible during drag */}
      {isDragging && ghostAnchor && (
        <AnchorGuides activeAnchor={ghostAnchor} />
      )}

      <motion.div
        className={cn(
          'lg:hidden fixed z-50 overflow-hidden border-gray-700 shadow-2xl bg-gray-900',
          getBorderClass(anchor),
        )}
        style={getPanelStyle(anchor, contentW, panelSideH, isDragging)}
        animate={animateProp}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        onHoverStart={() => setHovering(true)}
        onHoverEnd={() => setHovering(false)}
      >
        <div className="flex h-full w-full bg-gray-900" style={{ flexDirection: flexDir }}>
          {isHorizontal ? horizontalPeekBar : verticalPeekBar}
          <div className="flex-1 overflow-hidden flex flex-col bg-gray-900">
            {/* Tab bar inside the expanded area for left/right anchors */}
            {!isHorizontal && (
              <div className="flex gap-1 px-2 pt-1 flex-shrink-0 border-b border-gray-700/60">
                <button
                  className={cn('text-[9px] font-bold px-2 py-0.5 rounded mb-1 transition-colors',
                    tab === 'resources' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300')}
                  
                  onClick={() => setTab('resources')}
                >
                  Hand
                </button>
                <button
                  className={cn('flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded mb-1 transition-colors',
                    tab === 'devcards' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300')}
                  
                  onClick={() => setTab('devcards')}
                >
                  <DevCardIcon size={9} color="currentColor"/> {devCount}
                </button>
              </div>
            )}
            <div className="flex-1 no-scrollbar overflow-x-auto">
              {contentArea}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
