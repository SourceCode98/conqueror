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
import ResourceHand from '../components/game/ResourceHand.js';
import BankTradePanel from '../components/game/BankTradePanel.js';
import TradeOfferPanel from '../components/game/TradeOfferPanel.js';
import TradeResponsePanel from '../components/game/TradeResponsePanel.js';
import GameLog from '../components/game/GameLog.js';
import ChatPanel from '../components/game/ChatPanel.js';
import { PLAYER_COLOR_HEX } from '../components/HexBoard/hexLayout.js';
import { cn } from '../lib/cn.js';

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


export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const { gameState, localPlayerId, setLocalPlayerId, resetGame, tradePanel, closeTradePanel } = useGameStore();
  const didConnect = useRef(false);

  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<'actions' | 'chat' | null>(null);

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

  const tradeOffer = gameState.tradeOffer;
  const showResponsePanel = gameState.phase === 'TRADE_OFFER'
    && tradeOffer !== null
    && tradeOffer.fromPlayerId !== localPlayerId;

  const sheetOpen = mobileSheet !== null;

  return (
    <div className="h-dvh bg-gray-900 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <button className="text-gray-400 hover:text-white text-sm" onClick={() => navigate('/lobby')}>
          ← Lobby
        </button>

        {/* Desktop: title */}
        <span className="hidden lg:inline text-amber-400 font-bold">Conqueror</span>

        {/* Mobile: phase + action/chat toggles */}
        <span className="lg:hidden text-xs text-gray-300 font-medium truncate max-w-[120px]">
          {t(`phases.${gameState.phase}`)}
        </span>

        <div className="flex items-center gap-1">
          {/* Desktop: phase label */}
          <span className="hidden lg:inline text-sm text-gray-400">
            {t(`phases.${gameState.phase}`)}
          </span>

          {/* Mobile: actions + chat buttons */}
          <button
            className={cn(
              'lg:hidden flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors',
              mobileSheet === 'actions'
                ? 'bg-amber-700 border-amber-500 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-300',
            )}
            onClick={() => setMobileSheet(s => s === 'actions' ? null : 'actions')}
          >
            ⚡ Actions
          </button>
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
      {localPlayer && <ResourceHand resources={localPlayer.resources as any}/>}

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
        <div className="relative flex-1 flex items-center justify-center bg-[#1a6896] overflow-hidden">
          <HexBoard state={gameState} />

          {/* Floating player list — top-left overlay */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
            {gameState.players.map(p => {
              const color = PLAYER_COLOR_HEX[p.color] ?? '#888';
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
                  {/* Active dot */}
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
                </div>
              );
            })}
          </div>
        </div>

        {/* Right sidebar — desktop only */}
        <div className="hidden lg:flex w-72 flex-shrink-0 bg-gray-800 border-l border-gray-700 flex-col">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <DiceRoller
              diceRoll={gameState.diceRoll}
              phase={gameState.phase}
              isMyTurn={gameState.activePlayerId === localPlayerId}
            />
            <ActionPanel gameState={gameState} gameId={gameId!} />
          </div>
          <div className="h-36 flex-shrink-0 border-t border-gray-700">
            <GameLog log={gameState.log} />
          </div>
          <div className="h-32 flex-shrink-0 border-t border-gray-700">
            <ChatPanel gameId={gameId!} />
          </div>
        </div>
      </div>

      {/* ── Mobile bottom sheet ── */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sheet-backdrop"
              className="lg:hidden fixed inset-0 z-40 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSheet(null)}
            />

            {/* Sheet */}
            <motion.div
              key="sheet-panel"
              className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-gray-800 rounded-t-2xl border-t border-gray-700 flex flex-col"
              style={{ maxHeight: '72dvh' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.2 }}
              onDragEnd={(_, info) => { if (info.offset.y > 80) setMobileSheet(null); }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2 flex-shrink-0" onClick={() => setMobileSheet(null)}>
                <div className="w-10 h-1 rounded-full bg-gray-600" />
              </div>

              {mobileSheet === 'actions' && (
                <div
                  className="overflow-y-auto p-4 space-y-3"
                  style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
                >
                  <DiceRoller
                    diceRoll={gameState.diceRoll}
                    phase={gameState.phase}
                    isMyTurn={gameState.activePlayerId === localPlayerId}
                  />
                  <ActionPanel gameState={gameState} gameId={gameId!} />
                </div>
              )}

              {mobileSheet === 'chat' && (
                <div className="flex flex-col flex-1 overflow-hidden"
                  style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                  <div className="flex-1 overflow-y-auto border-b border-gray-700" style={{ minHeight: 0 }}>
                    <GameLog log={gameState.log} />
                  </div>
                  <div className="flex-shrink-0">
                    <ChatPanel gameId={gameId!} />
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
