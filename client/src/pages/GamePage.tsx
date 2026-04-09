import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore.js';
import { useGameStore } from '../store/gameStore.js';
import { wsService } from '../services/wsService.js';
import HexBoard from '../components/HexBoard/HexBoard.js';
import PlayerPanel from '../components/game/PlayerPanel.js';
import ActionPanel from '../components/game/ActionPanel.js';
import DiceRoller from '../components/game/DiceRoller.js';
import ResourceHand from '../components/game/ResourceHand.js';
import BankTradePanel from '../components/game/BankTradePanel.js';
import TradeOfferPanel from '../components/game/TradeOfferPanel.js';
import TradeResponsePanel from '../components/game/TradeResponsePanel.js';
import GameLog from '../components/game/GameLog.js';
import ChatPanel from '../components/game/ChatPanel.js';

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

    // Fetch lobby info immediately and poll while waiting for game to start
    fetchLobbyInfo();

    return () => {
      wsService.disconnect();
      didConnect.current = false;
    };
  }, [gameId, token, user]);

  // Poll lobby info every 3s while game hasn't started
  useEffect(() => {
    if (gameState) return; // Game started — stop polling
    const interval = setInterval(fetchLobbyInfo, 3000);
    return () => clearInterval(interval);
  }, [gameState, fetchLobbyInfo]);

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

  // ── Lobby waiting room (game not started yet) ─────────────────────────────
  if (!gameState) {
    const isHost = lobbyInfo?.created_by_username === user?.username;
    const playerCount = lobbyInfo?.players.length ?? 0;
    const maxPlayers = lobbyInfo?.max_players ?? 4;
    const canStart = playerCount >= 2;

    return (
      <div className="h-dvh bg-gray-900 flex flex-col items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              className="text-gray-400 hover:text-white text-sm"
              onClick={() => navigate('/lobby')}
            >
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

            {/* Player list */}
            <div className="space-y-2">
              {lobbyInfo?.players.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLOR_HEX[p.color] ?? '#888' }}
                  />
                  <span className="font-medium">{p.username}</span>
                  {p.username === lobbyInfo.created_by_username && (
                    <span className="text-xs text-amber-400">Host</span>
                  )}
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: maxPlayers - playerCount }, (_, i) => (
                <div key={`empty-${i}`} className="flex items-center gap-3 opacity-40">
                  <div className="w-4 h-4 rounded-full border border-gray-600" />
                  <span className="text-gray-500 text-sm">Waiting for player…</span>
                </div>
              ))}
            </div>
          </div>

          {/* Start button (host only) */}
          {isHost && (
            <div>
              {!canStart && (
                <p className="text-yellow-500 text-sm text-center mb-2">
                  Need at least 2 players to start
                </p>
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
            <p className="text-center text-gray-400 text-sm">
              Waiting for the host to start the game…
            </p>
          )}

          {/* Share link */}
          <p className="text-center text-xs text-gray-600 mt-4">
            Game ID: <code className="text-gray-500">{gameId}</code>
          </p>
        </div>
      </div>
    );
  }

  // ── Active game view ───────────────────────────────────────────────────────
  const localPlayer = gameState.players.find(p => p.id === localPlayerId);

  // Show trade response panel when this player receives an offer
  const tradeOffer = gameState.tradeOffer;
  const showResponsePanel = gameState.phase === 'TRADE_OFFER'
    && tradeOffer !== null
    && tradeOffer.fromPlayerId !== localPlayerId;

  return (
    <div className="h-dvh bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <button className="text-gray-400 hover:text-white text-sm" onClick={() => navigate('/lobby')}>
          ← Lobby
        </button>
        <span className="text-amber-400 font-bold">Conqueror</span>
        <span className="text-sm text-gray-400">
          {t(`phases.${gameState.phase}`)}
        </span>
      </div>

      {/* Resource hand — fixed bottom overlay, local player only */}
      {localPlayer && <ResourceHand resources={localPlayer.resources as any}/>}

      {/* Modal backdrop — covers board/sidebar behind any open panel */}
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
        {tradePanel === 'bank'  && <BankTradePanel  key="bank"     gameId={gameId!}/>}
        {tradePanel === 'offer' && <TradeOfferPanel key="offer"    gameId={gameId!}/>}
        {showResponsePanel      && <TradeResponsePanel key="resp"  gameId={gameId!}/>}
      </AnimatePresence>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — players */}
        <div className="w-56 flex-shrink-0 bg-gray-800 border-r border-gray-700 overflow-y-auto p-2 space-y-2">
          {gameState.players.map(p => (
            <PlayerPanel key={p.id} player={p} isActive={gameState.activePlayerId === p.id} />
          ))}
        </div>

        {/* Center — hex board */}
        <div className="flex-1 flex items-center justify-center bg-[#1a6896] overflow-hidden">
          <HexBoard state={gameState} />
        </div>

        {/* Right sidebar — actions, log, chat */}
        <div className="w-72 flex-shrink-0 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Dice — always visible to all players */}
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
    </div>
  );
}
