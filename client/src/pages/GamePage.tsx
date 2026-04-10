import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { useAuthStore } from '../store/authStore.js';
import { useGameStore } from '../store/gameStore.js';
import { wsService } from '../services/wsService.js';
import HexBoard from '../components/HexBoard/HexBoard.js';
import ActionPanel from '../components/game/ActionPanel.js';
import DiceRoller from '../components/game/DiceRoller.js';
import { Die, useDiceAnimation } from '../components/game/DiceRoller.js';
import ContextBar from '../components/game/ContextBar.js';
import ResourceHand, { HAND_HEADER_H, HAND_PEEK_H as HAND_PEEK } from '../components/game/ResourceHand.js';
import BankTradePanel from '../components/game/BankTradePanel.js';
import TradeOfferPanel from '../components/game/TradeOfferPanel.js';
import TradeResponsePanel from '../components/game/TradeResponsePanel.js';
import GameLog from '../components/game/GameLog.js';
import ChatPanel from '../components/game/ChatPanel.js';
import ActionToast from '../components/game/ActionToast.js';
import TurnTimer from '../components/game/TurnTimer.js';
import BuildCostTable from '../components/game/BuildCostTable.js';
import SoundPanel from '../components/game/SoundPanel.js';
import DiscardPanel from '../components/game/DiscardPanel.js';
import { resolvePlayerColor } from '../components/HexBoard/hexLayout.js';
import { cn } from '../lib/cn.js';

// Board padding: top = ResourceHand peek bar, bottom = ContextBar height
const MOBILE_BOARD_PT = HAND_PEEK; // 32px — peek bar sits above board
const MOBILE_BOARD_PB = 56;        // ContextBar height

// ── Floating instruction pill shown over the board when in a board-tap mode ──
function BoardHint({ hint, onCancel }: { hint: string | null; onCancel: () => void }) {
  return (
    <AnimatePresence>
      {hint && (
        <motion.div
          key={hint}
          initial={{ opacity: 0, y: -12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-2xl pointer-events-auto select-none"
          style={{
            background: 'rgba(10,14,26,0.92)',
            border: '1px solid rgba(251,191,36,0.35)',
            backdropFilter: 'blur(10px)',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="text-amber-300 text-sm font-semibold">{hint}</span>
          <button
            onClick={onCancel}
            className="ml-1 rounded-xl bg-gray-700/80 hover:bg-gray-600 text-gray-300 text-xs px-2.5 py-1 transition-colors"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Compact animated dice shown in board overlay (mobile) ──────────────────
function MobileDiceWidget({ diceRoll, phase, gameId }: {
  diceRoll: [number, number] | null;
  phase: string;
  gameId: string;
}) {
  const { animState, faces } = useDiceAnimation(diceRoll, phase);
  const rolling = animState === 'rolling';
  const dim     = animState === 'idle' && !diceRoll;
  const total   = diceRoll ? diceRoll[0] + diceRoll[1] : null;

  return (
    <div className="lg:hidden absolute top-2 right-2 flex flex-col items-end gap-2">
      {/* Dice faces */}
      <div className="flex items-center gap-1.5 rounded-2xl px-2.5 py-2 shadow-xl border border-gray-700 bg-gray-900/85"
        style={{ backdropFilter: 'blur(8px)' }}>
        <Die value={faces[0]} rolling={rolling} dim={dim} size={32}/>
        <Die value={faces[1]} rolling={rolling} dim={dim} size={32}/>
        {total !== null && animState === 'showing' && (
          <span className={cn(
            'ml-1 text-sm font-bold tabular-nums',
            total === 7 ? 'text-red-400' : (total === 6 || total === 8) ? 'text-orange-400' : 'text-white',
          )}>= {total}</span>
        )}
        {animState === 'idle' && !diceRoll && (
          <span className="ml-1 text-xs text-gray-500">—</span>
        )}
      </div>
      {/* SoundPanel */}
      <SoundPanel gameId={gameId}/>
    </div>
  );
}

interface LobbyInfo {
  id: string;
  name: string;
  status: string;
  max_players: number;
  created_by_username: string;
  players: Array<{ id: string; username: string; color: string; seat_order: number }>;
}

const COLOR_HEX: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', orange: '#f97316',
};

// HAND_PEEK_H used for discard overlay safe area
const HAND_PEEK_H = HAND_PEEK;

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const { gameState, localPlayerId, setLocalPlayerId, resetGame, tradePanel, closeTradePanel } = useGameStore();
  const _boardMode    = useGameStore(s => s.boardMode);
  const _roadEdges    = useGameStore(s => s.roadBuildingEdges);
  const _cancelRoad   = useGameStore(s => s.cancelRoadBuilding);
  const _setBoardMode = useGameStore(s => s.setBoardMode);
  const didConnect = useRef(false);

  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<'chat' | null>(null);
  const [showCostTable, setShowCostTable] = useState(false);

  const fetchLobbyInfo = useCallback(async () => {
    if (!gameId || !token) return;
    const res = await fetch(`/api/games/${gameId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLobbyInfo(data);
    }
  }, [gameId, token]);

  useEffect(() => {
    if (!gameId || !token || !user || didConnect.current) return;
    didConnect.current = true;

    resetGame();
    setLocalPlayerId(user.id);
    wsService.connect(gameId, token);

    fetchLobbyInfo();

    return () => {
      wsService.disconnect();
      didConnect.current = false;
    };
  }, [gameId, token, user]);

  // Poll lobby info every 3s while game hasn't started
  useEffect(() => {
    if (gameState) return;
    const interval = setInterval(fetchLobbyInfo, 3000);
    return () => clearInterval(interval);
  }, [gameState, fetchLobbyInfo]);

  // Close mobile sheet when a trade panel opens
  useEffect(() => {
    if (tradePanel !== null) setMobileSheet(null);
  }, [tradePanel]);

  async function startGame() {
    if (!gameId || !token) return;
    setStartError('');
    setStarting(true);
    try {
      const res = await fetch(`/api/games/${gameId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) setStartError(data.error ?? 'Failed to start game');
    } catch {
      setStartError('Network error');
    } finally {
      setStarting(false);
    }
  }

  // ── Lobby waiting room ────────────────────────────────────────────────────
  if (!gameState) {
    const isHost = lobbyInfo?.created_by_username === user?.username;
    const playerCount = lobbyInfo?.players.length ?? 0;
    const maxPlayers = lobbyInfo?.max_players ?? 4;
    const canStart = playerCount >= 2;

    return (
      <div className="h-dvh bg-gray-900 flex flex-col items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <button className="text-gray-400 hover:text-white text-sm" onClick={() => navigate('/lobby')}>
              ← Back
            </button>
            <h1 className="text-2xl font-bold text-amber-400">
              {lobbyInfo?.name ?? 'Loading…'}
            </h1>
            <div />
          </div>

          <div className="card mb-4">
            <div className="flex justify-between text-sm text-gray-400 mb-3">
              <span>{t('common:players')}: {playerCount} / {maxPlayers}</span>
              <span>{isHost ? '👑 Host' : ''}</span>
            </div>

            <div className="space-y-2">
              {lobbyInfo?.players.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: COLOR_HEX[p.color] ?? '#888' }}/>
                  <span className="font-medium">{p.username}</span>
                  {p.username === lobbyInfo.created_by_username && (
                    <span className="text-xs text-amber-400">Host</span>
                  )}
                </div>
              ))}
              {Array.from({ length: maxPlayers - playerCount }, (_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-3 opacity-40">
                  <div className="w-4 h-4 rounded-full border border-gray-600" />
                  <span className="text-gray-500 text-sm">Waiting for player…</span>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <div>
              {!canStart && (
                <p className="text-yellow-500 text-sm text-center mb-2">Need at least 2 players to start</p>
              )}
              {startError && (
                <p className="text-red-400 text-sm text-center mb-2">{startError}</p>
              )}
              <button
                className="btn-primary w-full text-lg py-3"
                disabled={!canStart || starting}
                onClick={startGame}
              >
                {starting ? 'Starting…' : `${t('common:startGame')} (${playerCount} players)`}
              </button>
            </div>
          )}

          {!isHost && (
            <p className="text-center text-gray-400 text-sm">Waiting for the host to start the game…</p>
          )}

          <p className="text-center text-xs text-gray-600 mt-4">
            Game ID: <code className="text-gray-500">{gameId}</code>
          </p>
        </div>
      </div>
    );
  }

  // ── Active game view ───────────────────────────────────────────────────────
  const localPlayer = gameState.players.find(p => p.id === localPlayerId);
  const isMyTurn = gameState.activePlayerId === localPlayerId;
  const phase = gameState.phase;

  const tradeOffer = gameState.tradeOffer;
  // Show response panel for all non-offerers when TRADE_OFFER is active
  const showResponsePanel = phase === 'TRADE_OFFER'
    && tradeOffer !== null
    && tradeOffer.fromPlayerId !== localPlayerId;

  const sheetOpen = mobileSheet !== null;

  // Mobile quick-action shortcuts
  const canRollNow   = phase === 'ROLL'   && isMyTurn;
  const canEndTurn   = phase === 'ACTION' && isMyTurn;

  const discardNeeded = localPlayerId ? (gameState.discardsPending?.[localPlayerId] ?? 0) : 0;

  // Board hint: contextual instruction shown as a floating pill over the board
  const boardHint =
    _boardMode === 'place_settlement' ? 'Tap an intersection to place your Settlement' :
    _boardMode === 'place_city'       ? 'Tap your settlement to upgrade to a City' :
    _boardMode === 'place_road'       ? 'Tap an edge to place your Road' :
    _boardMode === 'move_bandit'      ? 'Tap a tile to move the Bandit' :
    _roadEdges  !== null              ? `Road Building — pick edge ${(_roadEdges?.length ?? 0) + 1}/2` :
    null;
  const cancelHint = () => {
    if (_roadEdges !== null) _cancelRoad();
    else _setBoardMode(null);
  };

  return (
    <div className="h-dvh bg-gray-900 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <button className="text-gray-400 hover:text-white text-sm" onClick={() => navigate('/lobby')}>
          ← Lobby
        </button>

        {/* Desktop: title */}
        <span className="hidden lg:inline text-amber-400 font-bold">Conqueror</span>

        {/* Mobile: phase + timer */}
        <div className="lg:hidden flex items-center gap-2">
          <span className="text-xs text-gray-300 font-medium truncate max-w-[120px]">
            {t(`phases.${phase}`)}
          </span>
          {gameState.turnStartTime && gameState.turnTimeLimit && (
            <TurnTimer
              turnStartTime={gameState.turnStartTime}
              turnTimeLimit={gameState.turnTimeLimit}
              isMyTurn={isMyTurn}
              gameId={gameId!}
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Desktop: phase label + timer */}
          <span className="hidden lg:inline text-sm text-gray-400">
            {t(`phases.${phase}`)}
          </span>
          {gameState.turnStartTime && gameState.turnTimeLimit && (
            <TurnTimer
              turnStartTime={gameState.turnStartTime}
              turnTimeLimit={gameState.turnTimeLimit}
              isMyTurn={isMyTurn}
              gameId={gameId!}
              className="hidden lg:flex"
            />
          )}

          {/* Build cost reference */}
          <button
            className="hidden lg:flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors"
            onClick={() => setShowCostTable(s => !s)}
            title="Build costs"
          >
            📋
          </button>

          {/* Sound + Horn panel */}
          <SoundPanel gameId={gameId!} className="hidden lg:flex"/>

          {/* Mobile: chat toggle */}
          <button
            className={cn(
              'lg:hidden flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors',
              mobileSheet === 'chat'
                ? 'bg-blue-700 border-blue-500 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-300',
            )}
            onClick={() => setMobileSheet(s => s === 'chat' ? null : 'chat')}
          >
            💬
          </button>
        </div>
      </div>

      {/* Resource hand — fixed bottom overlay */}
      {localPlayer && <ResourceHand resources={localPlayer.resources as any} devCards={localPlayer.devCards}/>}

      {/* Toast notifications */}
      <ActionToast gameState={gameState}/>

      {/* Trade panel backdrop */}
      <AnimatePresence>
        {(tradePanel !== null || showResponsePanel) && (
          <div
            className="fixed inset-0 z-30 bg-black/50"
            onClick={tradePanel !== null ? closeTradePanel : undefined}
          />
        )}
      </AnimatePresence>

      {/* Trade panels */}
      <AnimatePresence>
        {tradePanel === 'bank'  && <BankTradePanel  key="bank"  gameId={gameId!}/>}
        {tradePanel === 'offer' && <TradeOfferPanel key="offer" gameId={gameId!}/>}
        {showResponsePanel      && <TradeResponsePanel key="resp" gameId={gameId!}/>}
      </AnimatePresence>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Center — hex board (full width, players overlay on top) */}
        <div
          className="relative flex-1 flex items-center justify-center bg-[#060e1c] overflow-hidden"
          style={{ paddingTop: MOBILE_BOARD_PT, paddingBottom: MOBILE_BOARD_PB }}
        >
          <HexBoard state={gameState} />

          {/* Floating player list — top-left overlay */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
            {gameState.players.map(p => {
              const color = resolvePlayerColor(p.color);
              const isActive = gameState.activePlayerId === p.id;
              const isMe = p.id === localPlayerId;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1"
                  style={{
                    background: isActive ? 'rgba(17,24,39,0.85)' : 'rgba(17,24,39,0.55)',
                    border: isActive ? `1px solid ${color}` : '1px solid transparent',
                    backdropFilter: 'blur(4px)',
                    opacity: (p as any).connected === false ? 0.5 : 1,
                  }}
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 7, height: 7,
                      backgroundColor: isActive ? color : '#4b5563',
                      boxShadow: isActive ? `0 0 5px ${color}` : 'none',
                    }}
                  />
                  <span
                    className="text-xs font-semibold leading-none truncate max-w-[80px]"
                    style={{ color: isActive ? '#fff' : '#9ca3af' }}
                  >
                    {p.username}{isMe ? ' ✦' : ''}
                  </span>
                  <span
                    className="text-[10px] font-bold tabular-nums shrink-0 ml-auto pl-1"
                    style={{ color: isActive ? '#fbbf24' : '#6b7280' }}
                  >
                    {p.victoryPoints}VP
                  </span>
                  {/* Special cards */}
                  {p.hasGrandRoad && (
                    <span className="text-[9px] bg-yellow-800/80 text-yellow-200 rounded px-0.5" title="Grand Road">🛣</span>
                  )}
                  {p.hasSupremeArmy && (
                    <span className="text-[9px] bg-red-900/80 text-red-200 rounded px-0.5" title="Supreme Army">⚔️</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Board instruction hint pill ── */}
          <BoardHint hint={boardHint} onCancel={cancelHint}/>

          {/* ── Mobile: compact dice result widget + SoundPanel ── */}
          <MobileDiceWidget
            diceRoll={gameState.diceRoll}
            phase={phase}
            gameId={gameId!}
          />

          {/* Build cost table — desktop floating panel */}
          <AnimatePresence>
            {showCostTable && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="hidden lg:block absolute top-2 right-2"
              >
                <BuildCostTable onClose={() => setShowCostTable(false)}/>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right sidebar — desktop only */}
        <div className="hidden lg:flex w-72 flex-shrink-0 bg-gray-800 border-l border-gray-700 flex-col">
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ paddingBottom: HAND_PEEK_H + 8 }}>
            <DiceRoller
              diceRoll={gameState.diceRoll}
              phase={phase}
              isMyTurn={isMyTurn}
            />
            <ActionPanel gameState={gameState} gameId={gameId!} />
          </div>
          <div className="h-36 flex-shrink-0 border-t border-gray-700">
            <GameLog log={gameState.log} />
          </div>
          <div className="h-32 flex-shrink-0 border-t border-gray-700" style={{ paddingBottom: HAND_PEEK_H }}>
            <ChatPanel gameId={gameId!} />
          </div>
        </div>
      </div>

      {/* ── Mobile: Discard overlay — anchored at bottom, above ContextBar ── */}
      {discardNeeded > 0 && localPlayer && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-[54] bg-gray-900 border-t border-red-800"
          style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${MOBILE_BOARD_PB}px)` }}>
          <div className="px-3 py-2">
            <DiscardPanel gameId={gameId!} hand={localPlayer.resources as any} requiredCount={discardNeeded}/>
          </div>
        </div>
      )}

      {/* ── Mobile: ContextBar — fixed at the very bottom ── */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-[52] bg-gray-900 border-t border-gray-700"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <ContextBar gameState={gameState} gameId={gameId!}/>
      </div>

      {/* ── Mobile bottom sheet (chat only) ── */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              key="sheet-backdrop"
              className="lg:hidden fixed inset-0 z-40 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSheet(null)}
            />
            <motion.div
              key="sheet-panel"
              className="lg:hidden fixed inset-x-0 bottom-0 bg-gray-800 rounded-t-2xl border-t border-gray-700 flex flex-col"
              style={{ maxHeight: '80dvh', zIndex: 60 }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.2 }}
              onDragEnd={(_, info) => { if (info.offset.y > 80) setMobileSheet(null); }}
            >
              <div className="flex justify-center pt-3 pb-2 flex-shrink-0" onClick={() => setMobileSheet(null)}>
                <div className="w-10 h-1 rounded-full bg-gray-600"/>
              </div>
              <div className="flex flex-col flex-1 overflow-hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                <div className="flex-1 overflow-y-auto border-b border-gray-700" style={{ minHeight: 0 }}>
                  <GameLog log={gameState.log}/>
                </div>
                <div className="flex-shrink-0">
                  <ChatPanel gameId={gameId!}/>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
