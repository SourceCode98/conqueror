import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import type { PublicGameState, ResourceType, EdgeId, AxialCoord } from '@conqueror/shared';
import { ALL_RESOURCES, hexVertexIds } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';
import DiscardPanel from './DiscardPanel.js';
import StealCardModal from './StealCardModal.js';
import {
  SettlementIcon, CityIcon, RoadIcon, BanditIcon,
  DevCardIcon, DiceIcon, FloatingDevCard, RESOURCE_ICON_MAP,
} from '../icons/GameIcons.js';
import { cn } from '../../lib/cn.js';

interface Props {
  gameState: PublicGameState;
  gameId: string;
}

// ── Card type metadata ────────────────────────────────────────────────────────
const CARD_META: Record<string, { bg: string; border: string; textColor: string; icon: React.ReactNode; desc: string }> = {
  warrior:      { bg: 'bg-blue-950',   border: 'border-blue-700',   textColor: 'text-blue-200',   icon: <BanditIcon size={28} color="#93c5fd"/>,        desc: 'Move the bandit, steal a card' },
  roadBuilding: { bg: 'bg-amber-950',  border: 'border-amber-700',  textColor: 'text-amber-200',  icon: <RoadIcon size={28} color="#fcd34d"/>,           desc: 'Place 2 roads for free' },
  yearOfPlenty: { bg: 'bg-green-950',  border: 'border-green-700',  textColor: 'text-green-200',  icon: <span className="text-2xl">🌟</span>,           desc: 'Take any 2 resources' },
  monopoly:     { bg: 'bg-purple-950', border: 'border-purple-700', textColor: 'text-purple-200', icon: <span className="text-2xl">💰</span>,           desc: 'Claim all of one resource' },
  victoryPoint: { bg: 'bg-yellow-900', border: 'border-yellow-600', textColor: 'text-yellow-200', icon: <span className="text-2xl">⭐</span>,           desc: '+1 Victory Point' },
};

// ── Build cost display ────────────────────────────────────────────────────────
const COSTS: Record<string, Array<{ r: ResourceType; n: number }>> = {
  settlement: [{ r: 'timber', n: 1 }, { r: 'clay', n: 1 }, { r: 'grain', n: 1 }, { r: 'wool', n: 1 }],
  city:       [{ r: 'iron', n: 3 }, { r: 'grain', n: 2 }],
  road:       [{ r: 'timber', n: 1 }, { r: 'clay', n: 1 }],
  devCard:    [{ r: 'iron', n: 1 }, { r: 'grain', n: 1 }, { r: 'wool', n: 1 }],
};

function CostBadges({ item }: { item: string }) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {COSTS[item]?.map(({ r, n }) => (
        <span key={r} className="flex items-center gap-0 bg-gray-900 rounded px-0.5">
          {RESOURCE_ICON_MAP[r]?.({ size: 11 })}
          {n > 1 && <span className="text-[9px] text-gray-300">×{n}</span>}
        </span>
      ))}
    </div>
  );
}

interface DragCard { type: string; idx: number; x: number; y: number }

export default function ActionPanel({ gameState, gameId }: Props) {
  const { t } = useTranslation('game');
  const {
    isMyTurn, myPlayer, canAfford,
    boardMode, setBoardMode,
    roadBuildingEdges, startRoadBuilding, cancelRoadBuilding,
    pendingBanditCoord, setPendingBanditCoord,
    localPlayerId, openTradePanel,
  } = useGameStore();

  const myTurn = isMyTurn();
  const me = myPlayer();
  const phase = gameState.phase;

  const [yopPicking, setYopPicking] = useState(false);
  const [yopPicks, setYopPicks] = useState<ResourceType[]>([]);
  const [monoPicking, setMonoPicking] = useState(false);
  const [stealTarget, setStealTarget] = useState<string | null>(null); // playerId to steal from
  const [stealModalOpen, setStealModalOpen] = useState(false);
  const savedBanditCoordRef = useRef<AxialCoord | null>(null);
  const [stolenNotif, setStolenNotif] = useState<ResourceType | null>(null); // shown to victim
  const prevResourcesRef = useRef<Record<ResourceType, number> | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

  // ── Dev card drag ─────────────────────────────────────────────────────────
  const [dragCard, setDragCard] = useState<DragCard | null>(null);
  const [dropZoneHover, setDropZoneHover] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragCardRef = useRef<DragCard | null>(null);
  dragCardRef.current = dragCard;

  const onCardMove = useCallback((e: PointerEvent) => {
    setDragCard(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    // Check if over drop zone
    const zone = dropZoneRef.current;
    if (zone) {
      const r = zone.getBoundingClientRect();
      setDropZoneHover(
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top  && e.clientY <= r.bottom
      );
    }
  }, []);

  const onCardUp = useCallback((e: PointerEvent) => {
    document.removeEventListener('pointermove', onCardMove);
    document.removeEventListener('pointerup', onCardUp);
    setDropZoneHover(false);
    const card = dragCardRef.current;
    setDragCard(null);
    if (!card) return;
    const zone = dropZoneRef.current;
    if (!zone) return;
    const r = zone.getBoundingClientRect();
    const over = e.clientX >= r.left && e.clientX <= r.right
      && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over) playCard(card.type);
  }, [onCardMove]);

  function startCardDrag(type: string, idx: number, e: React.PointerEvent) {
    e.preventDefault();
    const c = { type, idx, x: e.clientX, y: e.clientY };
    setDragCard(c);
    dragCardRef.current = c;
    document.addEventListener('pointermove', onCardMove);
    document.addEventListener('pointerup', onCardUp);
  }

  function playCard(cardType: string) {
    if (cardType === 'roadBuilding')  { startRoadBuilding(); }
    else if (cardType === 'yearOfPlenty') { setYopPicking(true); }
    else if (cardType === 'monopoly')     { setMonoPicking(true); }
    else wsService.send({ type: 'PLAY_DEV_CARD', payload: { gameId, cardType: cardType as any } });
  }

  // Road Building: send once 2 edges collected
  useEffect(() => {
    if (roadBuildingEdges?.length === 2) {
      wsService.send({
        type: 'PLAY_DEV_CARD',
        payload: { gameId, cardType: 'roadBuilding', params: { edges: roadBuildingEdges as [EdgeId, EdgeId] } },
      });
      cancelRoadBuilding();
    }
  }, [roadBuildingEdges]);

  // Reset dialogs on turn/phase change (but not steal modal — it manages its own lifecycle)
  useEffect(() => {
    setYopPicking(false); setYopPicks([]); setMonoPicking(false);
    if (!stealModalOpen) setStealTarget(null);
  }, [gameState.activePlayerId, gameState.phase]);

  // Victim notification: snapshot when entering ROBBER, detect loss when leaving
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = gameState.phase;

    if (gameState.phase === 'ROBBER' && prevPhase !== 'ROBBER' && me) {
      prevResourcesRef.current = { ...me.resources as Record<ResourceType, number> };
      return;
    }
    if (prevPhase === 'ROBBER' && gameState.phase !== 'ROBBER' && me && prevResourcesRef.current) {
      const prev = prevResourcesRef.current;
      prevResourcesRef.current = null;
      const lost = ALL_RESOURCES.find(r => (me.resources as any)[r] < (prev[r] ?? 0));
      if (lost) {
        setStolenNotif(lost);
        const t = setTimeout(() => setStolenNotif(null), 4000);
        return () => clearTimeout(t);
      }
    }
  }, [gameState.phase, me]);

  function send(type: string, extra?: object) {
    wsService.send({ type: type as any, payload: { gameId, ...extra } });
  }

  // ── Setup step ────────────────────────────────────────────────────────────
  const myId = me?.id ?? localPlayerId;
  const myBuildingCount = myId ? Object.values(gameState.buildings).filter(b => b.playerId === myId).length : 0;
  const myRoadCount = myId ? Object.values(gameState.roads).filter(r => r.playerId === myId).length : 0;
  const setupStep: 'settlement' | 'road' = myBuildingCount > myRoadCount ? 'road' : 'settlement';

  // ── Bandit adjacent players ───────────────────────────────────────────────
  function getAdjacentPlayers(coord: AxialCoord) {
    const vids = hexVertexIds(coord);
    const ids = new Set<string>();
    for (const vid of vids) {
      const b = gameState.buildings[vid as any];
      if (b && b.playerId !== myId) ids.add(b.playerId);
    }
    return [...ids].map(pid => gameState.players.find(p => p.id === pid)).filter(Boolean);
  }

  // ── Reusable build button ─────────────────────────────────────────────────
  function BuildBtn({
    mode, icon, label, item,
  }: {
    mode: 'place_settlement' | 'place_city' | 'place_road';
    icon: React.ReactNode;
    label: string;
    item: 'settlement' | 'city' | 'road';
  }) {
    const active = boardMode === mode;
    const affordable = canAfford(item);
    const pieceType = mode === 'place_settlement' ? 'settlement'
      : mode === 'place_city' ? 'city' : 'road';
    return (
      <button
        className={cn(
          'w-full rounded-lg border p-2 text-left transition-all select-none',
          'flex items-center gap-2',
          active
            ? 'border-amber-400 bg-amber-900/40 text-white'
            : affordable
              ? 'border-green-600 bg-gray-800 text-white hover:bg-gray-700 animate-[pulse-ring_2s_ease-in-out_infinite]'
              : 'border-gray-700 bg-gray-800 text-gray-500 cursor-not-allowed',
        )}
        disabled={!affordable}
        onClick={() => setBoardMode(active ? null : mode)}
        onPointerDown={(e) => {
          if (!affordable) return;
          if (!active) {
            setBoardMode(mode);
            (window as any).__hexBoardStartDrag?.(pieceType, e.clientX, e.clientY);
          }
        }}
      >
        <span className={cn('shrink-0', affordable && !active && 'drop-shadow-[0_0_4px_rgba(74,222,128,0.6)]')}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{label}</div>
          <CostBadges item={item}/>
        </div>
        {affordable && !active && (
          <span className="text-[9px] font-bold text-green-400 shrink-0">✓</span>
        )}
        {active && <span className="text-[9px] text-amber-300 shrink-0">ON</span>}
      </button>
    );
  }

  // ── Steal modal — rendered independently so it survives phase transitions ──
  if (stealModalOpen && stealTarget) {
    const victim = gameState.players.find(p => p.id === stealTarget);
    const cardCount = victim
      ? ALL_RESOURCES.reduce((s, r) => s + (victim.resources as any)[r], 0)
      : 0;
    return (
      <>
        <div className="text-center py-4 text-gray-500 text-sm">Selecting card to steal…</div>
        <StealCardModal
          victimId={stealTarget}
          cardCount={cardCount}
          onSteal={() => {
            const coord = savedBanditCoordRef.current;
            if (coord) send('MOVE_BANDIT', { coord, stealFromPlayerId: stealTarget });
          }}
          onClose={() => {
            setStealModalOpen(false);
            setStealTarget(null);
            setPendingBanditCoord(null);
          }}
        />
      </>
    );
  }

  // ── Victim toast — fixed overlay, renders regardless of phase ─────────────
  const victimToast = stolenNotif && (
    <AnimatePresence>
      <motion.div
        key="victim-toast"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 border border-red-700 rounded-2xl px-4 py-3 shadow-2xl"
      >
        <span className="text-red-400 text-lg">🗡️</span>
        <div className="flex items-center gap-2">
          <span className="text-red-300 font-semibold text-sm">A card was stolen!</span>
          <div className="flex items-center gap-1">
            {RESOURCE_ICON_MAP[stolenNotif]?.({ size: 20 })}
            <span className="text-xs font-bold" style={{ color: '#f97316' }}>
              {stolenNotif.charAt(0).toUpperCase() + stolenNotif.slice(1)}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  // ── Not my turn ───────────────────────────────────────────────────────────
  if (!myTurn && phase !== 'DISCARD' && phase !== 'TRADE_OFFER') {
    const activeName = gameState.players.find(p => p.id === gameState.activePlayerId)?.username;
    return (
      <>
        {victimToast}
        <div className="text-gray-400 text-sm text-center py-4 text-pretty">
          Waiting for {activeName}…
        </div>
      </>
    );
  }

  // ── Discard phase ─────────────────────────────────────────────────────────
  if (phase === 'DISCARD' && me && myId && gameState.discardsPending[myId] > 0) {
    return <DiscardPanel gameId={gameId} hand={me.resources as any} requiredCount={gameState.discardsPending[myId]}/>;
  }
  if (phase === 'DISCARD') {
    return <>{victimToast}<div className="text-yellow-400 text-sm text-center py-4">Waiting for others to discard…</div></>;
  }

  // ── Setup phases ──────────────────────────────────────────────────────────
  if ((phase === 'SETUP_FORWARD' || phase === 'SETUP_REVERSE') && myTurn) {
    const isSettlement = setupStep === 'settlement';
    return (
      <div className="space-y-2">
        <p className="text-amber-400 font-semibold text-sm">{t(`phases.${phase}`)}</p>
        <p className="text-gray-300 text-sm">
          {isSettlement ? 'Place your settlement on any intersection.' : 'Place a road adjacent to your settlement.'}
        </p>
        <button
          className={cn('btn-primary w-full flex items-center gap-2', boardMode && 'ring-2 ring-amber-300')}
          onClick={() => setBoardMode(boardMode ? null : (isSettlement ? 'place_settlement' : 'place_road'))}
          onPointerDown={(e) => {
            if (!boardMode) {
              const m = isSettlement ? 'place_settlement' : 'place_road';
              setBoardMode(m);
              (window as any).__hexBoardStartDrag?.(isSettlement ? 'settlement' : 'road', e.clientX, e.clientY);
            }
          }}
        >
          {isSettlement ? <SettlementIcon size={18} color="white"/> : <RoadIcon size={18} color="white"/>}
          {boardMode ? 'Click a spot on the board…' : (isSettlement ? 'Place Settlement' : 'Place Road')}
        </button>
        {boardMode && <button className="btn-secondary w-full text-sm" onClick={() => setBoardMode(null)}>Cancel</button>}
      </div>
    );
  }
  if ((phase === 'SETUP_FORWARD' || phase === 'SETUP_REVERSE') && !myTurn) {
    const activeName = gameState.players.find(p => p.id === gameState.activePlayerId)?.username;
    return <div className="text-gray-400 text-sm text-center py-4">Waiting for {activeName}…</div>;
  }

  // ── Roll phase ────────────────────────────────────────────────────────────
  if (phase === 'ROLL') {
    return (
      <div className="space-y-2">
        {victimToast}
        <button
          className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-lg"
          onClick={() => send('ROLL_DICE')}
        >
          <DiceIcon size={22} color="white"/>
          {t('actions.rollDice')}
        </button>
        {me?.devCards?.some(c => c.type === 'warrior' && !c.playedThisTurn && !c.boughtThisTurn) && (
          <button
            className="btn-secondary w-full text-sm flex items-center gap-2"
            onClick={() => send('PLAY_DEV_CARD', { cardType: 'warrior' })}
          >
            <BanditIcon size={16} color="#f97316"/>
            Play Warrior (before roll)
          </button>
        )}
      </div>
    );
  }

  // ── Robber phase ──────────────────────────────────────────────────────────
  if (phase === 'ROBBER') {
    if (pendingBanditCoord) {
      const adj = getAdjacentPlayers(pendingBanditCoord);

      // Player-selection step
      return (
        <div className="space-y-2">
          <p className="text-amber-400 font-semibold text-sm">Bandit placed!</p>
          {adj.length > 0 && (
            <p className="text-gray-400 text-xs">Choose a player to rob:</p>
          )}
          {adj.map(p => p && (
            <button key={p.id}
              className="w-full rounded-lg border border-gray-600 bg-gray-800 hover:border-amber-500 p-2 text-left flex items-center gap-2 text-sm transition-colors"
              onClick={() => {
                savedBanditCoordRef.current = pendingBanditCoord;
                setStealTarget(p.id);
                setStealModalOpen(true);
              }}
            >
              <div className="size-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: { red:'#ef4444',blue:'#3b82f6',green:'#22c55e',orange:'#f97316' }[p.color] ?? '#888' }}/>
              <span className="font-medium text-white">{p.username}</span>
              <span className="ml-auto text-xs text-gray-400">
                {ALL_RESOURCES.reduce((s, r) => s + (p.resources as any)[r], 0)} cards
              </span>
            </button>
          ))}
          <button className="btn-primary w-full text-sm"
            onClick={() => { send('MOVE_BANDIT', { coord: pendingBanditCoord }); setPendingBanditCoord(null); }}>
            {adj.length > 0 ? 'Move without stealing' : 'Confirm Move'}
          </button>
          <button className="btn-secondary w-full text-xs"
            onClick={() => { setPendingBanditCoord(null); setBoardMode('move_bandit'); }}>
            ← Pick a different tile
          </button>
        </div>
      );
    }
    return (
      <div className="text-center py-3 space-y-1">
        <BanditIcon size={36} color="#f97316" className="mx-auto"/>
        <p className="text-amber-400 font-semibold text-sm">{t('bandit.selectTile')}</p>
        <p className="text-gray-400 text-xs">Drag the bandit or click a tile.</p>
      </div>
    );
  }

  // ── Trade offer phase ─────────────────────────────────────────────────────
  if (phase === 'TRADE_OFFER' && gameState.tradeOffer) {
    const offer = gameState.tradeOffer;
    if (offer.fromPlayerId !== me?.id) {
      // Non-offerer: TradeResponsePanel modal handles it (see GamePage)
      return (
        <div className="text-center py-4 text-gray-500 text-sm text-pretty">
          Incoming trade offer — see the modal below
        </div>
      );
    }

    // Offerer's waiting view
    const acceptors = Object.entries(offer.respondents).filter(([, s]) => s === 'accept');
    const pending   = Object.entries(offer.respondents).filter(([, s]) => s === 'pending');
    const rejected  = Object.entries(offer.respondents).filter(([, s]) => s === 'reject');
    return (
      <div className="space-y-2">
        <p className="text-amber-400 font-semibold text-sm">{t('trade.waitingForResponse')}</p>

        {acceptors.length === 0 && pending.length === 0 && (
          <p className="text-gray-500 text-xs text-center">No one can fulfill this trade</p>
        )}

        {acceptors.map(([pid]) => {
          const p = gameState.players.find(pl => pl.id === pid);
          return (
            <div key={pid} className="flex items-center justify-between bg-green-900/30 border border-green-800 rounded-lg px-3 py-2 text-sm">
              <span className="text-green-300 font-medium">{p?.username} ✓</span>
              <button className="btn-success text-xs px-2 py-1"
                onClick={() => send('ACCEPT_PLAYER_TRADE', { fromPlayerId: pid })}>
                Trade
              </button>
            </div>
          );
        })}

        {pending.map(([pid]) => {
          const p = gameState.players.find(pl => pl.id === pid);
          return (
            <div key={pid} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              <span className="text-gray-400">{p?.username}</span>
              <span className="text-gray-600 text-xs">⏳ deciding</span>
            </div>
          );
        })}

        {rejected.map(([pid]) => {
          const p = gameState.players.find(pl => pl.id === pid);
          return (
            <div key={pid} className="flex items-center justify-between px-3 py-2 text-sm opacity-40">
              <span className="text-gray-500">{p?.username}</span>
              <span className="text-red-500 text-xs">✕</span>
            </div>
          );
        })}

        <button className="btn-danger w-full text-sm" onClick={() => send('CANCEL_TRADE')}>{t('actions.cancelTrade')}</button>
      </div>
    );
  }

  // ── Year of Plenty ────────────────────────────────────────────────────────
  if (yopPicking) {
    return (
      <div className="space-y-2">
        <p className="text-amber-400 font-semibold text-sm">Year of Plenty — pick 2</p>
        <div className="grid grid-cols-5 gap-1">
          {ALL_RESOURCES.map(r => {
            const count = yopPicks.filter(x => x === r).length;
            return (
              <button key={r}
                disabled={yopPicks.length >= 2 && count === 0}
                onClick={() => {
                  if (count > 0) setYopPicks(p => { const i = p.lastIndexOf(r); return p.filter((_, idx) => idx !== i); });
                  else if (yopPicks.length < 2) setYopPicks(p => [...p, r]);
                }}
                className={cn(
                  'rounded p-1 text-center transition-colors flex flex-col items-center gap-0.5',
                  count > 0 ? 'bg-amber-600' : 'bg-gray-700 hover:bg-gray-600 disabled:opacity-40',
                )}
              >
                {RESOURCE_ICON_MAP[r]?.({ size: 22 })}
                {count > 0 && <span className="text-[10px] text-white">×{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button className="btn-primary flex-1 text-sm" disabled={yopPicks.length !== 2}
            onClick={() => {
              send('PLAY_DEV_CARD', { cardType: 'yearOfPlenty', params: { resources: yopPicks as [ResourceType, ResourceType] } });
              setYopPicking(false); setYopPicks([]);
            }}>Confirm ({yopPicks.length}/2)</button>
          <button className="btn-secondary text-sm px-3" onClick={() => { setYopPicking(false); setYopPicks([]); }}>Cancel</button>
        </div>
      </div>
    );
  }

  // ── Monopoly ──────────────────────────────────────────────────────────────
  if (monoPicking) {
    return (
      <div className="space-y-2">
        <p className="text-amber-400 font-semibold text-sm">Monopoly — pick a resource</p>
        <div className="grid grid-cols-5 gap-1">
          {ALL_RESOURCES.map(r => (
            <button key={r}
              onClick={() => { send('PLAY_DEV_CARD', { cardType: 'monopoly', params: { resource: r } }); setMonoPicking(false); }}
              className="rounded p-2 text-center bg-gray-700 hover:bg-purple-900 transition-colors flex flex-col items-center gap-1"
            >
              {RESOURCE_ICON_MAP[r]?.({ size: 24 })}
              <span className="text-[10px] text-gray-300">{t(`resources.${r}`)}</span>
            </button>
          ))}
        </div>
        <button className="btn-secondary w-full text-sm" onClick={() => setMonoPicking(false)}>Cancel</button>
      </div>
    );
  }

  // ── Action phase ──────────────────────────────────────────────────────────
  if (phase === 'ACTION') {
    const playableCards = me?.devCards?.filter(c => !c.playedThisTurn && !c.boughtThisTurn && c.type !== 'victoryPoint') ?? [];

    return (
      <div className="space-y-3">
        {victimToast}
        {/* Dev card drop zone (shown while dragging) */}
        {dragCard && (
          <div
            ref={dropZoneRef}
            className={cn(
              'rounded-xl border-2 border-dashed py-3 text-center text-xs font-semibold transition-colors',
              dropZoneHover
                ? 'border-amber-400 bg-amber-900/50 text-amber-200'
                : 'border-gray-500 bg-gray-800/60 text-gray-400',
            )}
          >
            {dropZoneHover ? '✓ Release to play' : 'Drop card here to play'}
          </div>
        )}

        <>
            {/* ── Build ── */}
            <section>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Build</p>
              <div className="space-y-1">
                <BuildBtn mode="place_settlement" item="settlement"
                  icon={<SettlementIcon size={16} color={canAfford('settlement') ? '#4ade80' : '#6b7280'}/>}
                  label={t('actions.buildSettlement')}/>
                <BuildBtn mode="place_city" item="city"
                  icon={<CityIcon size={16} color={canAfford('city') ? '#4ade80' : '#6b7280'}/>}
                  label={t('actions.buildCity')}/>
                <BuildBtn mode="place_road" item="road"
                  icon={<RoadIcon size={16} color={canAfford('road') ? '#4ade80' : '#6b7280'}/>}
                  label={t('actions.buildRoad')}/>
              </div>
            </section>

            {/* ── Buy dev card ── */}
            <button
              className={cn(
                'w-full rounded-lg border p-2 text-left flex items-center gap-2 transition-all',
                canAfford('devCard') && gameState.devCardDeckCount > 0
                  ? 'border-green-600 bg-gray-800 hover:bg-gray-700 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-500 cursor-not-allowed',
              )}
              disabled={!canAfford('devCard') || gameState.devCardDeckCount === 0}
              onClick={() => send('BUY_DEV_CARD')}
            >
              <DevCardIcon size={16} color={canAfford('devCard') ? '#f59e0b' : '#555'}/>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold">{t('actions.buyDevCard')}</div>
                <CostBadges item="devCard"/>
              </div>
              <span className="text-[9px] text-gray-500 tabular-nums shrink-0">{gameState.devCardDeckCount} left</span>
            </button>

            <hr className="border-gray-700"/>

            {/* ── Trade ── */}
            <div className="grid grid-cols-2 gap-1.5">
              <button className="btn-secondary text-xs flex items-center justify-center gap-1 py-2" onClick={() => openTradePanel('bank')}>
                <span>🏦</span>{t('actions.bankTrade')}
              </button>
              <button className="btn-secondary text-xs flex items-center justify-center gap-1 py-2" onClick={() => openTradePanel('offer')}>
                <span>🤝</span>{t('actions.offerTrade')}
              </button>
            </div>

            {/* ── Dev cards in hand ── */}
            {me?.devCards && me.devCards.length > 0 && (
              <section>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                  Your Cards
                  {playableCards.length > 0 && !dragCard && (
                    <span className="ml-1 text-blue-400 normal-case">— drag or click to play</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {me.devCards.map((card, i) => {
                    const used = card.playedThisTurn || card.boughtThisTurn || card.type === 'victoryPoint';
                    const meta = CARD_META[card.type];
                    const isBeingDragged = dragCard?.idx === i;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'relative w-[60px] rounded-xl border flex flex-col items-center overflow-hidden select-none transition-transform',
                          meta?.bg ?? 'bg-gray-800',
                          meta?.border ?? 'border-gray-700',
                          used ? 'opacity-40 cursor-not-allowed grayscale' : 'cursor-grab hover:scale-105 active:scale-95 shadow-md',
                          isBeingDragged && 'opacity-20 scale-95',
                        )}
                        style={{ height: 88 }}
                        onPointerDown={(e) => { if (!used) startCardDrag(card.type, i, e); }}
                        onClick={() => { if (!used && !dragCard) playCard(card.type); }}
                      >
                        {/* Card header stripe */}
                        <div className={cn('w-full h-1.5', meta?.border ? meta.border.replace('border-', 'bg-') : 'bg-gray-600')}/>
                        {/* Icon */}
                        <div className="flex-1 flex items-center justify-center py-1">
                          {meta?.icon ?? <DevCardIcon size={24} color="#888"/>}
                        </div>
                        {/* Card name */}
                        <div className={cn('w-full text-center pb-1 px-0.5', meta?.textColor ?? 'text-gray-300')}>
                          <div className="text-[8px] font-bold leading-tight text-pretty">
                            {t(`devCards.${card.type}`)}
                          </div>
                        </div>
                        {/* Status badges */}
                        {card.boughtThisTurn && (
                          <span className="absolute top-0.5 right-0.5 text-[7px] bg-green-700 text-white rounded px-0.5">NEW</span>
                        )}
                        {card.playedThisTurn && (
                          <span className="absolute top-0.5 right-0.5 text-[7px] bg-gray-700 text-gray-400 rounded px-0.5">USED</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
        </>

        <hr className="border-gray-700"/>
        <button className="btn-success w-full" onClick={() => send('END_TURN')}>
          {t('actions.endTurn')} →
        </button>
      </div>
    );
  }

  // ── Game over ─────────────────────────────────────────────────────────────
  if (phase === 'GAME_OVER' && gameState.winner) {
    const winner = gameState.players.find(p => p.id === gameState.winner);
    return (
      <div className="text-center py-4">
        <p className="text-2xl font-bold text-amber-400 text-balance">
          {t('win.title', { player: winner?.username })}
        </p>
        <p className="text-gray-400 text-sm mt-2 tabular-nums">{winner?.victoryPoints} VP</p>
      </div>
    );
  }

  return victimToast ?? null;
}
