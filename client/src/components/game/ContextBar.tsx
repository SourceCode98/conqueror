/**
 * ContextBar — mobile-only persistent action bar above ResourceHand.
 * Phase-aware: shows exactly the right actions with no drill-down submenus.
 * Every action is reachable in a single tap.
 */
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import type { PublicGameState, ResourceType, EdgeId } from '@conqueror/shared';
import { ALL_RESOURCES, hexVertexIds, hasResources, SOLDIER_COST, MAX_SOLDIERS_SETTLEMENT, MAX_SOLDIERS_CITY } from '@conqueror/shared';
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
  troopSupply:  'border-red-700    bg-red-950    text-red-200',
  marchOrders:  'border-cyan-700   bg-cyan-950   text-cyan-200',
};
const CARD_EMOJI: Record<string, string> = {
  warrior: '⚔️', roadBuilding: '🛣️', yearOfPlenty: '🌟', monopoly: '💰',
  troopSupply: '🪖', marchOrders: '🚶',
};
// CARD_LABEL now filled at render time via t(), kept as fallback
const CARD_LABEL_FALLBACK: Record<string, string> = {
  warrior: 'Warrior', roadBuilding: 'Road Build', yearOfPlenty: 'Plenty', monopoly: 'Monopoly',
  troopSupply: 'Troop Supply', marchOrders: 'March Orders',
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
  const { t } = useTranslation('game');
  const {
    isMyTurn, myPlayer, canAfford, boardMode, setBoardMode,
    openTradePanel, roadBuildingEdges, startRoadBuilding, cancelRoadBuilding,
    pendingBanditCoord, setPendingBanditCoord, localPlayerId,
    attackFromVertex, setAttackFromVertex, attackTargetVertex, setAttackTargetVertex,
    transferFromVertex, setTransferFromVertex,
    setCombatDicePhase,
  } = useGameStore();

  const [attackSoldiers, setAttackSoldiers] = useState(1);
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
    setTransferFromVertex(null);
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
        <p className="text-green-300 text-xs font-semibold">{t('ctx.yearOfPlenty', t('devCards.yearOfPlenty'))}</p>
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
          >{t('ctx.confirmCount', { count: yopPicks.length }) || `Confirm (${yopPicks.length}/2)`}</button>
          <button className="text-gray-500 text-sm px-1" onClick={() => { setYopPicking(false); setYopPicks([]); }}>✕</button>
        </div>
      </div>
    );
  }

  // ── Monopoly picker ──────────────────────────────────────────────────────
  if (monoPicking) {
    return (
      <div className="bg-purple-950/50 px-3 py-2 space-y-2">
        <p className="text-purple-300 text-xs font-semibold">{t('ctx.monopolyClaim', t('devCards.monopoly'))}</p>
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

  // ── Active board mode / road building — show cancel bar on mobile ──
  // Attack mode with a target selected falls through to ACTION phase instead
  if (((boardMode && boardMode !== 'move_bandit') || roadBuildingEdges !== null) && !(boardMode === 'attack' && attackTargetVertex)) {
    const hintText =
      boardMode === 'place_settlement' ? t('ctx.tapSettlement') :
      boardMode === 'place_city'       ? t('ctx.tapCity') :
      boardMode === 'place_road'       ? t('ctx.tapRoad') :
      boardMode === 'recruit_soldier'  ? t('ctx.tapRecruit') :
      boardMode === 'attack'           ? t('ctx.tapAttack') :
      roadBuildingEdges !== null       ? t('ctx.roadBuildingPick', { count: (roadBuildingEdges?.length ?? 0) + 1 }) :
      t('ctx.selectLocation');
    const cancel = () => {
      if (roadBuildingEdges !== null) cancelRoadBuilding();
      else setBoardMode(null);
    };
    return (
      <div className="px-3 py-2 flex items-center gap-3">
        <span className="flex-1 text-xs text-amber-300 font-medium">{hintText}</span>
        <button
          className="shrink-0 rounded-xl border border-gray-600 bg-gray-800 text-gray-300 text-sm font-semibold px-4 py-2 active:scale-95 transition-transform"
          onClick={cancel}
        >
          {t('ui.cancel')}
        </button>
      </div>
    );
  }

  // ── ROLL phase ───────────────────────────────────────────────────────────
  if (phase === 'ROLL' && myTurn) {
    const hasWarrior = !me?.devCardPlayedThisTurn && me?.devCards?.some(c => c.type === 'warrior' && !c.playedThisTurn && !c.boughtThisTurn);
    return (
      <div className="px-3 py-2 flex gap-2">
        <button
          className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.97] text-white font-bold text-sm py-3 flex items-center justify-center gap-2 transition-all shadow-lg"
          onClick={() => send('ROLL_DICE')}
        >
          {t('ctx.rollDice')}
        </button>
        {hasWarrior && (
          <button
            className="rounded-xl border border-blue-700 bg-blue-950 text-blue-200 text-xs font-semibold px-3 py-2 flex items-center gap-1 shrink-0"
            onClick={() => send('PLAY_DEV_CARD', { cardType: 'warrior' })}
          >
            <BanditIcon size={14} color="#93c5fd"/>
            {t('ctx.warrior')}
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
          {isSettlement ? t('ctx.tapPlaceSettlement') : t('ctx.tapPlaceRoad')}
        </button>
      </div>
    );
  }

  // ── ROBBER phase — tile selected, choose player to rob ───────────────────
  if (phase === 'ROBBER' && myTurn && pendingBanditCoord) {
    const vids = hexVertexIds(pendingBanditCoord);
    const adjIds = new Set<string>();
    for (const vid of vids) {
      const b = (gameState.buildings as any)[vid];
      if (b && b.playerId !== myId) adjIds.add(b.playerId);
    }
    const allVictims = [...adjIds].map(pid => gameState.players.find(p => p.id === pid)).filter(Boolean);

    // In war mode, check which victims have soldier protection on this tile
    const isProtected = (pid: string) => (gameState as any).warMode && vids.some(vid => {
      const b = (gameState.buildings as any)[vid];
      return b?.playerId === pid && (b.soldiers ?? 0) >= 1;
    });
    const stealableVictims = allVictims.filter(p => p && !isProtected(p.id));
    const protectedVictims = allVictims.filter(p => p && isProtected(p!.id));

    return (
      <div className="bg-orange-950/30 px-3 py-2 space-y-2">
        <p className="text-orange-300 text-xs font-semibold">{t('ctx.banditMoved')}</p>
        {protectedVictims.length > 0 && (
          <div className="rounded-lg border border-yellow-700/50 bg-yellow-950/30 px-2 py-1.5 text-xs text-yellow-300">
            🛡️ {t('ctx.isProtected', { count: protectedVictims.length, players: protectedVictims.map(p => p!.username).join(', ') })}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {stealableVictims.map(p => p && (
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
            {stealableVictims.length > 0 ? t('ctx.skipSteal') : t('actions.confirmTrade', 'Confirm')}
          </button>
        </div>
      </div>
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
        <p className="text-orange-300 text-xs font-semibold">⚔️ {t('ctx.isMovingBandit', { player: thief?.username })}</p>
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
        <span className="text-yellow-400 text-sm">{t('ctx.waitingDiscard')}</span>
      </div>
    );
  }

  // ── TRADE_OFFER phase ────────────────────────────────────────────────────
  if (phase === 'TRADE_OFFER' && gameState.tradeOffer) {
    const offer = gameState.tradeOffer;
    const offerer = gameState.players.find(p => p.id === offer.fromPlayerId);
    if (offer.fromPlayerId === myId) {
      // Offerer: show live response counts
      const acceptCount  = Object.values(offer.respondents).filter(r => r.status === 'accept').length;
      const pendingCount = Object.values(offer.respondents).filter(r => r.status === 'pending').length;
      return (
        <div className="bg-amber-950/30 px-4 py-3 flex items-center gap-2">
          <span className="text-amber-200 text-sm font-medium">
            {t('ctx.yourOffer')} —{' '}
            {acceptCount > 0 && <span className="text-green-400">{acceptCount} {t('ctx.accepted')}</span>}
            {acceptCount > 0 && pendingCount > 0 && ', '}
            {pendingCount > 0 && <span className="text-gray-400">{pendingCount} {t('ctx.deciding')}</span>}
            {acceptCount === 0 && pendingCount === 0 && <span className="text-red-400">{t('ctx.allDeclined')}</span>}
          </span>
        </div>
      );
    }
    const myResponse = myId ? offer.respondents[myId] : undefined;
    if (myResponse?.status === 'reject') {
      return (
        <div className="px-4 py-3">
          <span className="text-gray-500 text-sm">{t('ctx.youDeclined', { player: offerer?.username })}</span>
        </div>
      );
    }
    return (
      <div className="bg-amber-950/30 px-4 py-3">
        <span className="text-amber-200 text-sm font-medium">{t('ctx.tradeOfferFrom', { player: offerer?.username })}</span>
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
    const alreadyPlayedCard = me?.devCardPlayedThisTurn ?? false;
    const playable   = alreadyPlayedCard
      ? []
      : (me?.devCards?.filter(c => !c.playedThisTurn && !c.boughtThisTurn && c.type !== 'victoryPoint') ?? []);

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
                    {CARD_EMOJI[card.type] ?? '🃏'} {t(`devCards.${card.type}`, CARD_LABEL_FALLBACK[card.type] ?? card.type)}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attack source selected (mobile) */}
        {boardMode === 'attack' && attackFromVertex && !attackTargetVertex && (() => {
          const fb = (gameState.buildings as any)[attackFromVertex];
          return (
            <div className="mx-2 mb-1 rounded-xl border border-amber-700 bg-amber-950/30 px-3 py-2 flex items-center justify-between">
              <span className="text-amber-300 text-xs">{t('ctx.fromBuilding', { type: fb?.type, soldiers: fb?.soldiers ?? 0 })}</span>
              <button className="text-gray-500 hover:text-gray-300 text-sm leading-none ml-2"
                onClick={() => setAttackFromVertex(null)}>✕</button>
            </div>
          );
        })()}

        {/* Attack confirmation panel (mobile) */}
        {boardMode === 'attack' && attackFromVertex && attackTargetVertex && (() => {
          const fb = (gameState.buildings as any)[attackFromVertex];
          const tb = (gameState.buildings as any)[attackTargetVertex];
          const victim = gameState.players.find(p => p.id === tb?.playerId);
          const sourceSoldiers = fb?.soldiers ?? 0;
          const minSoldiers = tb?.sieged ? 1 : 2;
          const maxSendable = Math.min(sourceSoldiers, MAX_SOLDIERS_CITY);
          const canSendEnough = sourceSoldiers >= minSoldiers;
          const clampedSoldiers = Math.max(minSoldiers, Math.min(attackSoldiers, maxSendable));
          return (
            <div className="mx-2 mb-1 rounded-xl border border-red-700 bg-red-950/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-red-300 text-xs font-semibold">
                  ⚔️ {victim?.username}'s {tb?.type}{tb?.sieged ? ` ${t('ctx.besieged')}` : ''}
                </p>
                <button className="text-gray-500 hover:text-gray-300 text-sm leading-none"
                  onClick={() => { setAttackFromVertex(null); setAttackTargetVertex(null); }}>✕</button>
              </div>
              <p className="text-gray-400 text-xs">
                {t('ctx.defenders', { count: tb?.soldiers ?? 0, cityBonus: tb?.type === 'city' ? t('ctx.cityBonus') : '' })}
              </p>
              {canSendEnough ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400">{t('ctx.sendSoldiers')}</span>
                    <div className="flex gap-1 flex-wrap">
                      {Array.from({ length: maxSendable }, (_, i) => i + 1).map(n => {
                        const selected = n <= clampedSoldiers;
                        const disabled = n < minSoldiers;
                        return (
                          <button key={n}
                            className={cn('text-lg leading-none transition-all',
                              disabled ? 'opacity-20 cursor-not-allowed' :
                              selected ? 'opacity-100 scale-110' : 'opacity-30 hover:opacity-60'
                            )}
                            disabled={disabled}
                            onClick={() => !disabled && setAttackSoldiers(n)}>
                            🪖
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-xs text-gray-500">{t('ctx.ofCount', { count: clampedSoldiers, max: maxSendable })}</span>
                  </div>
                  <button
                    className="w-full rounded-lg bg-red-700 hover:bg-red-600 active:bg-red-800 text-white text-xs py-2 font-semibold"
                    onClick={() => {
                      const victim2 = gameState.players.find(p => p.id === tb?.playerId);
                      setCombatDicePhase({ attackerId: myId!, defenderId: tb?.playerId, attackerName: me?.username ?? '?', defenderName: victim2?.username ?? '?', timeoutSecs: 12 });
                      wsService.send({ type: 'ATTACK', payload: { gameId, fromVertexId: attackFromVertex as any, targetVertexId: attackTargetVertex as any, soldiers: clampedSoldiers } });
                      setBoardMode(null);
                      setAttackFromVertex(null);
                      setAttackTargetVertex(null);
                    }}>
                    {clampedSoldiers === 1 ? t('ctx.attackWith') : t('ctx.attackWith_plural', { count: clampedSoldiers })}
                  </button>
                </>
              ) : (
                <p className="text-yellow-500 text-xs">{t('ctx.needSoldiers', { min: minSoldiers })}</p>
              )}
            </div>
          );
        })()}

        {/* Transfer soldiers — source selected, waiting for destination tap */}
        {mode === 'transfer_soldiers' && transferFromVertex && (
          <div className="mx-2 mb-1 rounded-xl border border-blue-800 bg-blue-950/30 px-3 py-2 flex items-center justify-between">
            <span className="text-blue-300 text-xs">🪖 Origen seleccionado — toca el edificio destino en el tablero</span>
            <button className="text-gray-500 hover:text-gray-300 text-sm leading-none ml-2"
              onClick={() => setTransferFromVertex(null)}>✕</button>
          </div>
        )}


        {/* Free soldiers banner (from Troop Supply card) */}
        {myTurn && (me?.freeSoldiers ?? 0) > 0 && (
          <div className="mx-2 mb-1 rounded-xl border border-red-700 bg-red-950/30 px-3 py-1.5 flex items-center gap-2">
            <span className="text-red-300 text-xs font-semibold">{t('ctx.freeSoldiers', { count: me!.freeSoldiers })}</span>
          </div>
        )}

        {/* March Orders distance bonus banner */}
        {myTurn && ((gameState as any).transferDistanceBonus ?? 0) > 0 && (
          <div className="mx-2 mb-1 rounded-xl border border-cyan-700 bg-cyan-950/30 px-3 py-1.5 flex items-center gap-2">
            <span className="text-cyan-300 text-xs font-semibold">{t('ctx.marchOrders', { bonus: (gameState as any).transferDistanceBonus })}</span>
          </div>
        )}

        {/* Action buttons row */}
        <div className="flex items-center gap-0.5 px-1 pt-1.5 pb-1 overflow-x-auto scrollbar-none">
          <ActionBtn label={t('ctx.settle')} disabled={!canSettle} active={mode === 'place_settlement'}
            pieces={settlementsLeft}
            onClick={() => setBoardMode(mode === 'place_settlement' ? null : 'place_settlement')}>
            <SettlementIcon size={18} color={canSettle ? '#4ade80' : '#4b5563'}/>
          </ActionBtn>

          <ActionBtn label={t('ctx.road')} disabled={!canRoad} active={mode === 'place_road'}
            pieces={roadsLeft}
            onClick={() => setBoardMode(mode === 'place_road' ? null : 'place_road')}>
            <RoadIcon size={18} color={canRoad ? '#4ade80' : '#4b5563'}/>
          </ActionBtn>

          <ActionBtn label={t('ctx.city')} disabled={!canCity} active={mode === 'place_city'}
            pieces={citiesLeft}
            onClick={() => setBoardMode(mode === 'place_city' ? null : 'place_city')}>
            <CityIcon size={18} color={canCity ? '#4ade80' : '#4b5563'}/>
          </ActionBtn>

          <ActionBtn label={t('ctx.dev')} disabled={!canDevBuy}
            onClick={() => send('BUY_DEV_CARD')}>
            <DevCardIcon size={18} color={canDevBuy ? '#f59e0b' : '#4b5563'}/>
          </ActionBtn>

          {/* War buttons — only in war mode */}
          {(gameState as any).warMode && (() => {
            const totalSoldiers = Object.values(gameState.buildings)
              .filter((b: any) => b.playerId === myId)
              .reduce((s: number, b: any) => s + (b.soldiers ?? 0), 0);
            const canAttack = (!(gameState as any).attackUsedThisTurn || (gameState as any).warVariants?.totalWar) && totalSoldiers >= 1;
            const transfersLeft = 2 - ((gameState as any).transfersUsedThisTurn ?? 0);
            const canTransfer = totalSoldiers >= 1 && transfersLeft > 0;
            const hasFreeSlots = (me?.freeSoldiers ?? 0) > 0;
            const canRecruitAfford = hasFreeSlots || (me ? hasResources(me.resources as any, SOLDIER_COST as any) : false);
            const hasCapacity = Object.values(gameState.buildings).some((b: any) =>
              b.playerId === myId && !b.sieged &&
              (b.soldiers ?? 0) < (b.type === 'city' ? MAX_SOLDIERS_CITY : MAX_SOLDIERS_SETTLEMENT)
            );
            const canRecruit = canRecruitAfford && hasCapacity;
            return (
              <>
                <div className="w-px h-6 bg-gray-700 mx-0.5 shrink-0"/>
                <ActionBtn label={t('ctx.recruit')} active={mode === 'recruit_soldier'} disabled={!canRecruit}
                  onClick={() => { if (canRecruit) setBoardMode(mode === 'recruit_soldier' ? null : 'recruit_soldier'); }}>
                  <span className={cn('text-lg leading-none', !canRecruit && 'opacity-40')}>🪖</span>
                </ActionBtn>
                <ActionBtn label={t('ctx.attack')} disabled={!canAttack} active={mode === 'attack'}
                  badge={totalSoldiers > 0 ? totalSoldiers : undefined}
                  onClick={() => {
                    if (!canAttack) return;
                    setAttackTargetVertex(null);
                    setBoardMode(mode === 'attack' ? null : 'attack');
                  }}>
                  <span className={cn('text-lg leading-none', !canAttack && 'opacity-40')}>⚔️</span>
                </ActionBtn>
                <ActionBtn label={t('ctx.transfer')} disabled={!canTransfer} active={mode === 'transfer_soldiers'}
                  badge={transfersLeft < 2 ? transfersLeft : undefined}
                  onClick={() => {
                    if (!canTransfer) return;
                    setTransferFromVertex(null);
                    setBoardMode(mode === 'transfer_soldiers' ? null : 'transfer_soldiers');
                  }}>
                  <span className={cn('text-lg leading-none', !canTransfer && 'opacity-40')}>↔️</span>
                </ActionBtn>
              </>
            );
          })()}

          {/* Divider */}
          <div className="w-px h-6 bg-gray-700 mx-0.5 shrink-0"/>

          <ActionBtn label={t('ctx.bank')} onClick={() => openTradePanel('bank')}>
            <span className="text-lg leading-none">🏦</span>
          </ActionBtn>

          <ActionBtn label={t('ctx.trade')} onClick={() => openTradePanel('offer')}>
            <span className="text-lg leading-none">🤝</span>
          </ActionBtn>

          {playable.length > 0 && (
            <ActionBtn label={t('ctx.cards')} badge={playable.length} active={showCards}
              onClick={() => setShowCards(s => !s)}>
              <span className="text-lg leading-none">🃏</span>
            </ActionBtn>
          )}
        </div>

        {/* End Turn — own row, always fully visible */}
        <div className="px-2 pb-2">
          <button
            className="w-full rounded-xl bg-green-700 hover:bg-green-600 active:scale-[0.98] text-white font-bold text-sm py-2.5 transition-all shadow-md"
            onClick={() => send('END_TURN')}
          >
            {t('ctx.endTurn')}
          </button>
        </div>
      </div>
    );
  }

  // ── WAR_DESTRUCTION phase ────────────────────────────────────────────────
  if (phase === 'WAR_DESTRUCTION') {
    const pd = (gameState as any).pendingDestruction;
    const isAttacker = pd?.attackerId === myId;
    if (isAttacker) {
      return (
        <div className="bg-red-950/50 px-4 py-3 flex items-center gap-2">
          <span className="text-red-400 text-sm font-semibold">{t('ctx.chooseDestruction')}</span>
        </div>
      );
    }
    const attacker = gameState.players.find(p => p.id === pd?.attackerId);
    return (
      <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"/>
        <span className="text-gray-500 text-sm"><span className="text-red-300 font-medium">{attacker?.username}</span> {t('ctx.isChoosingDestruction', { player: '' }).trim()}</span>
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
          <span className="text-gray-500 text-sm">{t('ctx.waitingFor', { player: activeName })}</span>
        </div>
      );
    }
    return null;
  }

  return null;
}
