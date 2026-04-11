/**
 * ContextBar — mobile-only persistent action bar above ResourceHand.
 * Phase-aware: shows exactly the right actions with no drill-down submenus.
 * Every action is reachable in a single tap.
 */
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PublicGameState, ResourceType, EdgeId } from '@conqueror/shared';
import { ALL_RESOURCES, hexVertexIds } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import type { InteractionMode } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';
import StealCardModal from './StealCardModal.js';
import {
  SettlementIcon, CityIcon, RoadIcon, BanditIcon, DevCardIcon, RESOURCE_ICON_MAP,
} from '../icons/GameIcons.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';
import { cn } from '../../lib/cn.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CARD_COLOR: Record<string, string> = {
  warrior:      'border-blue-700   bg-blue-950   text-blue-200',
  roadBuilding: 'border-amber-700  bg-amber-950  text-amber-200',
  yearOfPlenty: 'border-green-700  bg-green-950  text-green-200',
  monopoly:     'border-purple-700 bg-purple-950 text-purple-200',
};
const CARD_EMOJI: Record<string, string> = {
  warrior: '⚔️', roadBuilding: '🛣️', yearOfPlenty: '🌟', monopoly: '💰',
};
const CARD_LABEL: Record<string, string> = {
  warrior: 'Warrior', roadBuilding: 'Road Build', yearOfPlenty: 'Plenty', monopoly: 'Monopoly',
};

function ActionBtn({
  label, children, disabled = false, active = false, badge, pieces, onClick,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  badge?: number;
  /** Remaining piece count — shown as a small tag; red when 0 */
  pieces?: number;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 min-w-[48px] transition-all select-none',
        active   ? 'bg-amber-700/80 text-white scale-95' :
        disabled ? 'text-gray-600 cursor-not-allowed' :
        'text-gray-300 hover:bg-gray-700/70 active:scale-95',
      )}
    >
      {children}
      <span className={cn(
        'text-[9px] font-semibold uppercase tracking-wide leading-none',
        active ? 'text-amber-200' : disabled ? 'text-gray-600' : 'text-gray-500',
      )}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5">
          {badge}
        </span>
      )}
      {pieces !== undefined && (
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-[8px] font-bold flex items-center justify-center px-0.5',
          pieces === 0 ? 'bg-red-600 text-white' : pieces <= 1 ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-gray-200',
        )}>
          {pieces}
        </span>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  gameState: PublicGameState;
  gameId: string;
}

export default function ContextBar({ gameState, gameId }: Props) {
  const {
    isMyTurn, myPlayer, canAfford, boardMode, setBoardMode,
    openTradePanel, roadBuildingEdges, startRoadBuilding, cancelRoadBuilding,
    pendingBanditCoord, setPendingBanditCoord, localPlayerId,
  } = useGameStore();

  const [yopPicking, setYopPicking]   = useState(false);
  const [yopPicks, setYopPicks]       = useState<ResourceType[]>([]);
  const [monoPicking, setMonoPicking] = useState(false);
  const [showCards, setShowCards]     = useState(false);
  const [mobileStealVictim, setMobileStealVictim] = useState<{ id: string; cardCount: number; coord: NonNullable<typeof pendingBanditCoord> } | null>(null);
  const savedCoordRef                 = useRef<typeof pendingBanditCoord>(null);

  const myTurn = isMyTurn();
  const me     = myPlayer();
  const myId   = me?.id ?? localPlayerId;
  const phase  = gameState.phase;
  // Capture full type before control-flow narrowing by early-return guards below
  const mode   = boardMode as InteractionMode;

  // Send road building when 2 edges collected
  useEffect(() => {
    if (roadBuildingEdges?.length === 2) {
      wsService.send({
        type: 'PLAY_DEV_CARD',
        payload: { gameId, cardType: 'roadBuilding', params: { edges: roadBuildingEdges as [EdgeId, EdgeId] } },
      });
      cancelRoadBuilding();
    }
  }, [roadBuildingEdges]);

  // Reset card picker on phase / turn change (but not steal victim — it manages its own lifecycle)
  useEffect(() => {
    setYopPicking(false); setYopPicks([]); setMonoPicking(false); setShowCards(false);
  }, [gameState.activePlayerId, gameState.phase]);

  function send(type: string, extra?: object) {
    wsService.send({ type: type as any, payload: { gameId, ...extra } });
  }

  // ── Steal modal — rendered before all phase guards so it survives phase transitions ──
  if (mobileStealVictim) {
    return (
      <StealCardModal
        victimId={mobileStealVictim.id}
        cardCount={mobileStealVictim.cardCount}
        onSteal={() => {
          send('MOVE_BANDIT', { coord: mobileStealVictim.coord, stealFromPlayerId: mobileStealVictim.id });
        }}
        onClose={() => setMobileStealVictim(null)}
      />
    );
  }

  // ── Year of Plenty picker ────────────────────────────────────────────────
  if (yopPicking) {
    return (
      <div className="bg-green-950/50 px-3 py-2 space-y-2">
        <p className="text-green-300 text-xs font-semibold">Year of Plenty — pick 2 resources</p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {ALL_RESOURCES.map(r => {
              const count = yopPicks.filter(x => x === r).length;
              return (
                <button key={r}
                  disabled={yopPicks.length >= 2 && count === 0}
                  onClick={() => {
                    if (count > 0) setYopPicks(p => { const i = p.lastIndexOf(r); return p.filter((_, idx) => idx !== i); });
                    else if (yopPicks.length < 2) setYopPicks(p => [...p, r]);
                  }}
                  className={cn('rounded-lg p-1.5 transition-colors', count > 0 ? 'bg-amber-600' : 'bg-gray-700 disabled:opacity-40')}
                >
                  {RESOURCE_ICON_MAP[r]?.({ size: 22 })}
                </button>
              );
            })}
          </div>
          <button
            disabled={yopPicks.length !== 2}
            className="ml-auto rounded-xl bg-green-700 disabled:opacity-40 text-white text-xs px-3 py-1.5 font-semibold"
            onClick={() => {
              send('PLAY_DEV_CARD', { cardType: 'yearOfPlenty', params: { resources: yopPicks as [ResourceType, ResourceType] } });
              setYopPicking(false); setYopPicks([]);
            }}
          >Confirm ({yopPicks.length}/2)</button>
          <button className="text-gray-500 text-sm px-1" onClick={() => { setYopPicking(false); setYopPicks([]); }}>✕</button>
        </div>
      </div>
    );
  }

  // ── Monopoly picker ──────────────────────────────────────────────────────
  if (monoPicking) {
    return (
      <div className="bg-purple-950/50 px-3 py-2 space-y-2">
        <p className="text-purple-300 text-xs font-semibold">Monopoly — claim all of one resource</p>
        <div className="flex items-center gap-1.5">
          {ALL_RESOURCES.map(r => (
            <button key={r}
              onClick={() => { send('PLAY_DEV_CARD', { cardType: 'monopoly', params: { resource: r } }); setMonoPicking(false); }}
              className="rounded-lg p-1.5 bg-gray-700 hover:bg-purple-900 transition-colors"
            >
              {RESOURCE_ICON_MAP[r]?.({ size: 24 })}
            </button>
          ))}
          <button className="ml-auto text-gray-500 text-sm px-1" onClick={() => setMonoPicking(false)}>✕</button>
        </div>
      </div>
    );
  }

  // ── Active board mode / road building — hint shown on board, bar is empty ──
  if ((boardMode && boardMode !== 'move_bandit') || roadBuildingEdges !== null) {
    return null;
  }

  // ── ROLL phase ───────────────────────────────────────────────────────────
  if (phase === 'ROLL' && myTurn) {
    const hasWarrior = me?.devCards?.some(c => c.type === 'warrior' && !c.playedThisTurn && !c.boughtThisTurn);
    return (
      <div className="px-3 py-2 flex gap-2">
        <button
          className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.97] text-white font-bold text-sm py-3 flex items-center justify-center gap-2 transition-all shadow-lg"
          onClick={() => send('ROLL_DICE')}
        >
          🎲 Roll Dice
        </button>
        {hasWarrior && (
          <button
            className="rounded-xl border border-blue-700 bg-blue-950 text-blue-200 text-xs font-semibold px-3 py-2 flex items-center gap-1 shrink-0"
            onClick={() => send('PLAY_DEV_CARD', { cardType: 'warrior' })}
          >
            <BanditIcon size={14} color="#93c5fd"/>
            Warrior
          </button>
        )}
      </div>
    );
  }

  // ── SETUP phases ─────────────────────────────────────────────────────────
  if ((phase === 'SETUP_FORWARD' || phase === 'SETUP_REVERSE') && myTurn) {
    const myBuildings = Object.values(gameState.buildings).filter(b => b.playerId === myId).length;
    const myRoads     = Object.values(gameState.roads).filter(r => r.playerId === myId).length;
    const isSettlement = myBuildings <= myRoads;
    const mode = isSettlement ? 'place_settlement' : 'place_road';
    return (
      <div className="px-3 py-2">
        <button
          className="w-full rounded-xl py-3 font-bold text-sm flex items-center justify-center gap-2 transition-all bg-amber-600 hover:bg-amber-500 active:scale-[0.97] text-white shadow-lg"
          onClick={() => setBoardMode(mode)}
        >
          {isSettlement ? <SettlementIcon size={16} color="white"/> : <RoadIcon size={16} color="white"/>}
          {isSettlement ? 'Tap board to place Settlement' : 'Tap board to place Road'}
        </button>
      </div>
    );
  }

  // ── ROBBER phase — tile selected, choose player to rob ───────────────────
  if (phase === 'ROBBER' && myTurn && pendingBanditCoord) {
    const vids = hexVertexIds(pendingBanditCoord);
    const adjIds = new Set<string>();
    for (const vid of vids) {
      const b = gameState.buildings[vid as any];
      if (b && b.playerId !== myId) adjIds.add(b.playerId);
    }
    const victims = [...adjIds].map(pid => gameState.players.find(p => p.id === pid)).filter(Boolean);

    return (
      <>
        <div className="bg-orange-950/30 px-3 py-2 space-y-2">
          <p className="text-orange-300 text-xs font-semibold">Bandit moved — steal from:</p>
          <div className="flex flex-wrap gap-2">
            {victims.map(p => p && (
              <button key={p.id}
                className="flex items-center gap-2 rounded-xl border border-gray-600 bg-gray-800 hover:border-amber-500 px-3 py-1.5 text-xs font-semibold transition-colors"
                onClick={() => {
                  const count = ALL_RESOURCES.reduce((s, r) => s + (p.resources as any)[r], 0);
                  setMobileStealVictim({ id: p.id, cardCount: count, coord: pendingBanditCoord! });
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: resolvePlayerColor(p.color) }}/>
                <span className="text-white">{p.username}</span>
                <span className="text-gray-400">{ALL_RESOURCES.reduce((s, r) => s + (p.resources as any)[r], 0)} cards</span>
              </button>
            ))}
            <button
              className="rounded-xl border border-gray-700 bg-gray-800 text-gray-400 text-xs px-3 py-1.5"
              onClick={() => { send('MOVE_BANDIT', { coord: pendingBanditCoord }); setPendingBanditCoord(null); }}
            >
              {victims.length > 0 ? 'Skip steal' : 'Confirm'}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── ROBBER phase — move the bandit (hint shown on board pill) ───────────
  if (phase === 'ROBBER' && myTurn && !pendingBanditCoord) {
    return null;
  }

  // ── ROBBER phase — not my turn, show "being robbed" visual ──────────────
  if (phase === 'ROBBER' && !myTurn) {
    const thief = gameState.players.find(p => p.id === gameState.activePlayerId);
    const myCardCount = me ? ALL_RESOURCES.reduce((s, r) => s + ((me.resources as any)[r] ?? 0), 0) : 0;
    return (
      <div className="bg-gray-900/80 px-3 py-2 space-y-1.5">
        <p className="text-orange-300 text-xs font-semibold">⚔️ {thief?.username} is moving the bandit…</p>
        {myCardCount > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {Array.from({ length: Math.min(myCardCount, 12) }, (_, i) => (
              <div key={i} className="shrink-0 rounded-md" style={{
                width: 22, height: 34,
                background: 'linear-gradient(160deg, #0d2b0d 0%, #091a09 100%)',
                border: '1.5px solid #2d6b1e',
              }}/>
            ))}
            {myCardCount > 12 && <span className="text-gray-600 text-xs self-center shrink-0">+{myCardCount - 12}</span>}
          </div>
        )}
      </div>
    );
  }

  // ── DISCARD phase ────────────────────────────────────────────────────────
  if (phase === 'DISCARD') {
    const needed = myId ? gameState.discardsPending[myId] ?? 0 : 0;
    if (needed > 0) return null; // discard overlay handled in GamePage
    return (
      <div className="px-4 py-2.5">
        <span className="text-yellow-400 text-sm">Waiting for others to discard…</span>
      </div>
    );
  }

  // ── TRADE_OFFER phase ────────────────────────────────────────────────────
  if (phase === 'TRADE_OFFER' && gameState.tradeOffer) {
    const offer = gameState.tradeOffer;
    const offerer = gameState.players.find(p => p.id === offer.fromPlayerId);
    if (offer.fromPlayerId === myId) {
      // Offerer: show live response counts
      const acceptCount  = Object.values(offer.respondents).filter(r => r === 'accept').length;
      const pendingCount = Object.values(offer.respondents).filter(r => r === 'pending').length;
      return (
        <div className="bg-amber-950/30 px-4 py-3 flex items-center gap-2">
          <span className="text-amber-200 text-sm font-medium">
            🤝 Your offer —{' '}
            {acceptCount > 0 && <span className="text-green-400">{acceptCount} accepted</span>}
            {acceptCount > 0 && pendingCount > 0 && ', '}
            {pendingCount > 0 && <span className="text-gray-400">{pendingCount} deciding</span>}
            {acceptCount === 0 && pendingCount === 0 && <span className="text-red-400">all declined</span>}
          </span>
        </div>
      );
    }
    const myResponse = myId ? offer.respondents[myId] : undefined;
    if (myResponse === 'reject') {
      return (
        <div className="px-4 py-3">
          <span className="text-gray-500 text-sm">You declined {offerer?.username}'s offer — waiting for others…</span>
        </div>
      );
    }
    return (
      <div className="bg-amber-950/30 px-4 py-3">
        <span className="text-amber-200 text-sm font-medium">🤝 Trade offer from {offerer?.username} — see panel above</span>
      </div>
    );
  }

  // ── ACTION phase ─────────────────────────────────────────────────────────
  if (phase === 'ACTION' && myTurn) {
    const settlementsLeft = me?.settlementsLeft ?? 0;
    const citiesLeft      = me?.citiesLeft ?? 0;
    const roadsLeft       = me?.roadsLeft ?? 0;
    const canSettle  = canAfford('settlement') && settlementsLeft > 0;
    const canRoad    = canAfford('road') && roadsLeft > 0;
    const canCity    = canAfford('city') && citiesLeft > 0;
    const canDevBuy  = canAfford('devCard') && gameState.devCardDeckCount > 0;
    const playable   = me?.devCards?.filter(c => !c.playedThisTurn && !c.boughtThisTurn && c.type !== 'victoryPoint') ?? [];

    return (
      <div className="bg-gray-900">

        {/* Dev card quick-pick (expands inline above buttons) */}
        <AnimatePresence>
          {showCards && playable.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto">
                {playable.map((card, i) => (
                  <button key={i}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors active:scale-95',
                      CARD_COLOR[card.type] ?? 'border-gray-600 bg-gray-800 text-gray-200',
                    )}
                    onClick={() => {
                      setShowCards(false);
                      if (card.type === 'yearOfPlenty') setYopPicking(true);
                      else if (card.type === 'monopoly') setMonoPicking(true);
                      else if (card.type === 'roadBuilding') startRoadBuilding();
                      else send('PLAY_DEV_CARD', { cardType: card.type });
                    }}
                  >
                    {CARD_EMOJI[card.type] ?? '🃏'} {CARD_LABEL[card.type] ?? card.type}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons row */}
        <div className="flex items-center gap-0.5 px-1 py-1.5">
          <ActionBtn label="Settle" disabled={!canSettle} active={mode === 'place_settlement'}
            pieces={settlementsLeft}
            onClick={() => setBoardMode(mode === 'place_settlement' ? null : 'place_settlement')}>
            <SettlementIcon size={18} color={canSettle ? '#4ade80' : '#4b5563'}/>
          </ActionBtn>

          <ActionBtn label="Road" disabled={!canRoad} active={mode === 'place_road'}
            pieces={roadsLeft}
            onClick={() => setBoardMode(mode === 'place_road' ? null : 'place_road')}>
            <RoadIcon size={18} color={canRoad ? '#4ade80' : '#4b5563'}/>
          </ActionBtn>

          <ActionBtn label="City" disabled={!canCity} active={mode === 'place_city'}
            pieces={citiesLeft}
            onClick={() => setBoardMode(mode === 'place_city' ? null : 'place_city')}>
            <CityIcon size={18} color={canCity ? '#4ade80' : '#4b5563'}/>
          </ActionBtn>

          <ActionBtn label="Dev" disabled={!canDevBuy}
            onClick={() => send('BUY_DEV_CARD')}>
            <DevCardIcon size={18} color={canDevBuy ? '#f59e0b' : '#4b5563'}/>
          </ActionBtn>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-700 mx-0.5"/>

          <ActionBtn label="Bank" onClick={() => openTradePanel('bank')}>
            <span className="text-lg leading-none">🏦</span>
          </ActionBtn>

          <ActionBtn label="Trade" onClick={() => openTradePanel('offer')}>
            <span className="text-lg leading-none">🤝</span>
          </ActionBtn>

          {playable.length > 0 && (
            <ActionBtn label="Cards" badge={playable.length} active={showCards}
              onClick={() => setShowCards(s => !s)}>
              <span className="text-lg leading-none">🃏</span>
            </ActionBtn>
          )}

          {/* Spacer pushes End Turn to the right */}
          <div className="flex-1"/>

          <button
            className="rounded-xl bg-green-700 hover:bg-green-600 active:scale-[0.97] text-white font-bold text-xs px-4 py-2.5 transition-all shadow-md"
            onClick={() => send('END_TURN')}
          >
            End →
          </button>
        </div>
      </div>
    );
  }

  // ── Waiting / other phases ────────────────────────────────────────────────
  if (phase !== 'GAME_OVER') {
    const activeName = gameState.players.find(p => p.id === gameState.activePlayerId)?.username;
    if (!myTurn && activeName) {
      return (
        <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-600 animate-pulse"/>
          <span className="text-gray-500 text-sm">Waiting for <span className="text-gray-300 font-medium">{activeName}</span>…</span>
        </div>
      );
    }
    return null;
  }

  return null;
}
