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
import ResourceHand, { HAND_HEADER_H, HAND_PEEK_H as HAND_PEEK, ResourceCard, DevCardMini } from '../components/game/ResourceHand.js';
import type { HandAnchor } from '../components/game/ResourceHand.js';
import BankTradePanel from '../components/game/BankTradePanel.js';
import TradeOfferPanel from '../components/game/TradeOfferPanel.js';
import TradeResponsePanel from '../components/game/TradeResponsePanel.js';
import GameLog from '../components/game/GameLog.js';
import ChatPanel from '../components/game/ChatPanel.js';
import WinCelebration from '../components/game/WinCelebration.js';
import ActionToast from '../components/game/ActionToast.js';
import TurnTimer from '../components/game/TurnTimer.js';
import BuildCostTable from '../components/game/BuildCostTable.js';
import SoundPanel from '../components/game/SoundPanel.js';
import { musicEngine } from '../components/game/musicEngine.js';
import DiscardPanel from '../components/game/DiscardPanel.js';
import { resolvePlayerColor } from '../components/HexBoard/hexLayout.js';
import { RESOURCE_ICON_MAP } from '../components/icons/GameIcons.js';
import { ALL_RESOURCES } from '@conqueror/shared';
import { cn } from '../lib/cn.js';

// Board padding: bottom = ContextBar + chat strip (top varies by hand anchor)
const MOBILE_CHAT_H   = 44;        // compact chat input strip height
const MOBILE_BOARD_PB = 56 + MOBILE_CHAT_H; // ContextBar + chat strip

function getHandAnchor(): HandAnchor {
  try { return (localStorage.getItem('hand-anchor') as HandAnchor) ?? 'top-center'; } catch { return 'top-center'; }
}

// ── Floating instruction pill shown over the board when in a board-tap mode ──
function BoardHint({ hint, onCancel, hideOnMobile }: { hint: string | null; onCancel: () => void; hideOnMobile?: boolean }) {
  return (
    <AnimatePresence>
      {hint && (
        <motion.div
          key={hint}
          initial={{ opacity: 0, y: -12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className={cn(
            'absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 items-center gap-2 rounded-2xl px-4 py-2.5 shadow-2xl pointer-events-auto select-none',
            hideOnMobile ? 'hidden lg:flex' : 'flex',
          )}
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

// ── Persistent mobile chat input strip ──────────────────────────────────────
function MobileChatBar({ gameId }: { gameId: string }) {
  const { chatMessages } = useGameStore();
  const [text, setText] = useState('');
  const [kbOffset, setKbOffset] = useState(0);
  const lastMsg = chatMessages[chatMessages.length - 1];

  // Track keyboard height via Visual Viewport API (iOS Safari + fallback)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      const offset = window.innerHeight - vv!.offsetTop - vv!.height;
      setKbOffset(Math.max(0, offset));
    }
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  function send() {
    if (!text.trim()) return;
    wsService.send({ type: 'CHAT', payload: { gameId, text: text.trim() } });
    setText('');
  }

  return (
    <div
      className="lg:hidden fixed inset-x-0 z-[51] bg-gray-900/95 border-t border-gray-700 flex items-center gap-2 px-2"
      style={{
        bottom: `calc(env(safe-area-inset-bottom, 0px) + 56px + ${kbOffset}px)`,
        height: MOBILE_CHAT_H,
        backdropFilter: 'blur(6px)',
        transition: kbOffset > 0 ? 'bottom 0.05s linear' : 'bottom 0.2s ease-out',
      }}
    >
      {/* Last message preview */}
      {lastMsg && (
        <p className="flex-1 text-[10px] text-gray-500 truncate min-w-0">
          <span className="text-amber-400 font-medium">{lastMsg.username}:</span> {lastMsg.text}
        </p>
      )}
      {!lastMsg && (
        <p className="flex-1 text-[10px] text-gray-600 italic">No messages yet</p>
      )}

      {/* Input + send */}
      <form
        className="flex items-center gap-1 shrink-0"
        onSubmit={e => { e.preventDefault(); send(); }}
      >
        <input
          className="w-28 rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
          placeholder="Message…"
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={200}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-40 px-2.5 py-1 text-xs font-semibold text-white transition-colors"
        >
          ↑
        </button>
      </form>
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


// HAND_PEEK_H used for discard overlay safe area
const HAND_PEEK_H = HAND_PEEK;

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const { gameState, localPlayerId, setLocalPlayerId, resetGame, tradePanel, closeTradePanel, stolenReveal, clearStolenReveal, wsConnected } = useGameStore();
  const _boardMode    = useGameStore(s => s.boardMode);
  const _roadEdges    = useGameStore(s => s.roadBuildingEdges);
  const _cancelRoad   = useGameStore(s => s.cancelRoadBuilding);
  const _setBoardMode = useGameStore(s => s.setBoardMode);
  const didConnect = useRef(false);

  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);
  const [turnTimeLimit, setTurnTimeLimit] = useState<number | null>(null); // seconds, null = no limit
  const [hornCooldownSecs, setHornCooldownSecs] = useState<number>(30);   // seconds between horn uses
  const [mobileSheet, setMobileSheet] = useState<'chat' | null>(null);
  const [showCostTable, setShowCostTable] = useState(false);
  const [showMobileCostTable, setShowMobileCostTable] = useState(false);
  const [handAnchor, setHandAnchor] = useState<HandAnchor>(getHandAnchor);

  // Sync hand anchor from ResourceHand via custom event
  useEffect(() => {
    const handler = (e: Event) => setHandAnchor((e as CustomEvent<HandAnchor>).detail);
    window.addEventListener('hand-anchor-change', handler);
    return () => window.removeEventListener('hand-anchor-change', handler);
  }, []);

  // Lock document scroll while game is mounted — prevents iOS keyboard from scrolling the page
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onScroll = () => window.scrollTo(0, 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

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
      musicEngine.stop();
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

  // Auto-dismiss stolen reveal after 4s
  useEffect(() => {
    if (!stolenReveal) return;
    const t = setTimeout(clearStolenReveal, 4000);
    return () => clearTimeout(t);
  }, [stolenReveal]);

  async function startGame() {
    if (!gameId || !token) return;
    setStartError('');
    setStarting(true);
    try {
      const res = await fetch(`/api/games/${gameId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ turnTimeLimit, hornCooldownSecs }),
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
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: resolvePlayerColor(p.color) }}/>
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
            <div className="space-y-3">
              {/* Turn time limit selector */}
              <div className="card py-2 px-3">
                <label className="block text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">
                  ⏱ Turn time limit
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[null, 60, 90, 120, 180].map(val => (
                    <button
                      key={String(val)}
                      onClick={() => setTurnTimeLimit(val)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm border transition-colors',
                        turnTimeLimit === val
                          ? 'border-amber-500 bg-amber-900/40 text-amber-300'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500',
                      )}
                    >
                      {val === null ? 'No limit' : `${val}s`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horn cooldown selector */}
              <div className="card py-2 px-3">
                <label className="block text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">
                  📯 Horn cooldown
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[10, 30, 60, 120].map(val => (
                    <button
                      key={val}
                      onClick={() => setHornCooldownSecs(val)}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm border transition-colors',
                        hornCooldownSecs === val
                          ? 'border-amber-500 bg-amber-900/40 text-amber-300'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500',
                      )}
                    >
                      {val}s
                    </button>
                  ))}
                </div>
              </div>

              {!canStart && (
                <p className="text-yellow-500 text-sm text-center">Need at least 2 players to start</p>
              )}
              {startError && (
                <p className="text-red-400 text-sm text-center">{startError}</p>
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
  const isHost = lobbyInfo?.created_by_username === user?.username;

  const tradeOffer = gameState.tradeOffer;
  // Show response panel for everyone during a trade offer:
  //   - Offerer: always shown so they can click "Confirm ✓" on acceptors
  //   - Others: shown unless they already declined
  const myTradeResponse = localPlayerId ? tradeOffer?.respondents[localPlayerId] : undefined;
  const showResponsePanel = phase === 'TRADE_OFFER'
    && tradeOffer !== null
    && (tradeOffer.fromPlayerId === localPlayerId || myTradeResponse !== 'reject');

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
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <button className="text-gray-400 hover:text-white text-sm" onClick={() => navigate('/lobby')}>
          ← Lobby
        </button>

        {/* Desktop: title */}
        <span className="hidden lg:inline text-amber-400 font-bold">Conqueror</span>

        {/* Mobile: phase + timer */}
        <div className="lg:hidden flex items-center gap-2">
          <span className="text-xs text-gray-300 font-medium truncate max-w-[140px]">
            {(() => {
              const activeName = gameState.players.find(p => p.id === gameState.activePlayerId)?.username ?? '';
              if (phase === 'TRADE_OFFER' && tradeOffer) return `🤝 ${activeName}`;
              return `${activeName} · ${t(`phases.${phase}`)}`;
            })()}
          </span>
          {gameState.turnStartTime && gameState.turnTimeLimit && phase !== 'GAME_OVER' && (
            <TurnTimer
              turnStartTime={gameState.turnStartTime}
              turnTimeLimit={gameState.turnTimeLimit}
              isMyTurn={isMyTurn}
              gameId={gameId!}
            />
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Desktop: active player + phase label + timer */}
          <span className="hidden lg:inline text-sm text-gray-400">
            {(() => {
              const activeName = gameState.players.find(p => p.id === gameState.activePlayerId)?.username ?? '';
              if (phase === 'TRADE_OFFER' && tradeOffer) return `🤝 ${activeName} · Trade`;
              return `${activeName} · ${t(`phases.${phase}`)}`;
            })()}
          </span>
          {gameState.turnStartTime && gameState.turnTimeLimit && phase !== 'GAME_OVER' && (
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

          {/* Host: end game button */}
          {isHost && phase !== 'GAME_OVER' && (
            <button
              className="hidden lg:flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 transition-colors"
              onClick={() => {
                if (confirm('End the game now? The player with the most VP wins.')) {
                  wsService.send({ type: 'END_GAME', payload: { gameId: gameId! } });
                }
              }}
            >
              🏁 End Game
            </button>
          )}

          {/* Sound + Horn panel */}
          <SoundPanel gameId={gameId!} className="hidden lg:flex"/>

          {/* Mobile: host end-game */}
          {isHost && phase !== 'GAME_OVER' && (
            <button
              className="lg:hidden rounded-lg px-2 py-1.5 text-xs border border-red-800 text-red-400"
              onClick={() => {
                if (confirm('End the game now?')) {
                  wsService.send({ type: 'END_GAME', payload: { gameId: gameId! } });
                }
              }}
            >
              🏁
            </button>
          )}

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

      {/* Victim stolen-card reveal modal */}
      <AnimatePresence>
        {stolenReveal && (() => {
          const CARD_THEME: Record<string, { bg: string; border: string; label: string }> = {
            timber: { bg: '#0f2e14', border: '#22c55e', label: 'Timber' },
            clay:   { bg: '#3b1004', border: '#f97316', label: 'Clay'   },
            iron:   { bg: '#131c2b', border: '#94a3b8', label: 'Iron'   },
            grain:  { bg: '#2e1d02', border: '#fbbf24', label: 'Grain'  },
            wool:   { bg: '#092b1b', border: '#86efac', label: 'Wool'   },
          };
          const theme = CARD_THEME[stolenReveal.resource];
          return (
            <motion.div
              key="stolen-reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.75)' }}
              onClick={clearStolenReveal}
            >
              <motion.div
                initial={{ scale: 0.7, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                onClick={e => e.stopPropagation()}
                className="bg-gray-900 rounded-3xl border border-gray-700 shadow-2xl px-8 py-6 text-center max-w-xs w-full mx-4"
              >
                <p className="text-red-400 font-bold text-lg mb-1">Robbed!</p>
                <p className="text-gray-400 text-sm mb-4">
                  <span className="text-white font-semibold">{stolenReveal.thiefName}</span> stole from you
                </p>
                <div className="flex justify-center mb-4">
                  <motion.div
                    initial={{ rotateY: 90 }}
                    animate={{ rotateY: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.15 }}
                    className="rounded-2xl border-2 flex flex-col items-center px-6 py-4"
                    style={{ backgroundColor: theme.bg, borderColor: theme.border }}
                  >
                    {RESOURCE_ICON_MAP[stolenReveal.resource as any]?.({ size: 52 })}
                    <span className="text-sm font-bold mt-2" style={{ color: theme.border }}>
                      {theme.label}
                    </span>
                  </motion.div>
                </div>
                <button
                  className="text-xs text-gray-500 hover:text-gray-300 underline"
                  onClick={clearStolenReveal}
                >
                  Dismiss
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

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
          style={{ paddingTop: handAnchor.startsWith('top') ? HAND_PEEK : 0, paddingBottom: handAnchor.startsWith('bottom') ? MOBILE_BOARD_PB + HAND_PEEK : MOBILE_BOARD_PB }}
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
                  className="rounded-lg px-2 py-1 space-y-0.5"
                  style={{
                    background: isActive ? 'rgba(17,24,39,0.88)' : 'rgba(17,24,39,0.55)',
                    border: isActive ? `1px solid ${color}` : '1px solid rgba(75,85,99,0.3)',
                    backdropFilter: 'blur(4px)',
                    opacity: (p as any).connected === false ? 0.5 : 1,
                    minWidth: 130,
                  }}
                >
                  {/* Row 1: dot + name + VP */}
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0 rounded-full" style={{
                      width: 7, height: 7,
                      backgroundColor: isActive ? color : '#4b5563',
                      boxShadow: isActive ? `0 0 5px ${color}` : 'none',
                    }}/>
                    <span className="text-xs font-semibold leading-none truncate max-w-[72px]"
                      style={{ color: isActive ? '#fff' : '#9ca3af' }}>
                      {p.username}{isMe ? ' ✦' : ''}
                    </span>
                    {/* Connection status */}
                    <span className="relative flex shrink-0 size-2" title={(p as any).connected !== false ? 'Online' : 'Offline'}>
                      {(p as any).connected !== false ? (
                        <>
                          <span className="absolute inset-0 rounded-full bg-green-400 opacity-50 animate-ping" style={{ animationDuration: '2s' }} />
                          <span className="relative size-2 rounded-full bg-green-400" />
                        </>
                      ) : (
                        <span className="size-2 rounded-full bg-red-500" />
                      )}
                    </span>
                    <span className="text-[10px] font-bold tabular-nums ml-auto shrink-0"
                      style={{ color: isActive ? '#fbbf24' : '#6b7280' }}>
                      {p.victoryPoints}VP
                    </span>
                    {p.hasGrandRoad && (
                      <span className="text-[9px] bg-yellow-800/80 text-yellow-200 rounded px-0.5" title="Grand Road">🛣</span>
                    )}
                    {p.hasSupremeArmy && (
                      <span className="text-[9px] bg-red-900/80 text-red-200 rounded px-0.5" title="Supreme Army">⚔️</span>
                    )}
                  </div>
                  {/* Row 2: stats */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] tabular-nums text-gray-500 flex items-center gap-0.5" title="Knights played">
                      ⚔️ <span className="font-bold text-gray-300">{p.knightsPlayed}</span>
                    </span>
                    <span className="text-[9px] tabular-nums text-gray-500 flex items-center gap-0.5" title="Dev cards in hand">
                      🃏 <span className="font-bold text-gray-300">{p.devCardCount}</span>
                    </span>
                    <span className="text-[9px] tabular-nums text-gray-500 flex items-center gap-0.5" title="Longest road">
                      🛤 <span className="font-bold text-gray-300">{p.longestRoadLength}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Board instruction hint pill ── */}
          <BoardHint hint={boardHint} onCancel={cancelHint} hideOnMobile/>

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

          {/* ── Mobile: build cost toggle + panel — fixed left side ── */}
          <div className="lg:hidden absolute left-0 top-1/2 -translate-y-1/2 z-20 flex flex-row items-center">
            {/* Toggle tab on left edge */}
            <button
              onClick={() => setShowMobileCostTable(s => !s)}
              className={cn(
                'rounded-r-xl border-y border-r shadow-xl backdrop-blur-sm transition-all active:scale-95 px-1.5 py-3 flex flex-col items-center gap-1',
                showMobileCostTable
                  ? 'bg-amber-700/90 border-amber-500 text-white'
                  : 'bg-gray-900/90 border-gray-700 text-gray-300',
              )}
            >
              <span className="text-base leading-none">🏗</span>
              <span className={cn(
                'text-[8px] font-bold uppercase tracking-wide',
                '[writing-mode:vertical-rl] rotate-180 leading-none',
                showMobileCostTable ? 'text-amber-200' : 'text-gray-500',
              )}>
                {showMobileCostTable ? '✕' : 'Costs'}
              </span>
            </button>

            {/* Collapsible cost panel slides right from the tab */}
            <AnimatePresence>
              {showMobileCostTable && (
                <motion.div
                  initial={{ opacity: 0, x: -12, scaleX: 0.85 }}
                  animate={{ opacity: 1, x: 0, scaleX: 1 }}
                  exit={{ opacity: 0, x: -12, scaleX: 0.85 }}
                  style={{ originX: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="rounded-r-2xl border-y border-r border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-sm px-3 py-3 space-y-3"
                >
                  {([
                    { label: 'Road',       icon: '🛣',  cost: { timber: 1, clay: 1 } },
                    { label: 'Settlement', icon: '🏠',  cost: { timber: 1, clay: 1, grain: 1, wool: 1 } },
                    { label: 'City',       icon: '🏙',  cost: { iron: 3, grain: 2 } },
                    { label: 'Dev Card',   icon: '🃏',  cost: { iron: 1, grain: 1, wool: 1 } },
                  ] as Array<{ label: string; icon: string; cost: Partial<Record<string, number>> }>).map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className="text-2xl w-8 text-center shrink-0">{item.icon}</span>
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-gray-200 block mb-1">{item.label}</span>
                        <div className="flex gap-1 flex-wrap">
                          {(Object.entries(item.cost) as [string, number][]).map(([r, n]) =>
                            Array.from({ length: n }, (_, i) => (
                              <span key={`${r}-${i}`} className="flex items-center justify-center rounded-lg bg-gray-800 border border-gray-600 w-7 h-7">
                                {RESOURCE_ICON_MAP[r as any]?.({ size: 18 })}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right sidebar — desktop only */}
        <div className="hidden lg:flex w-72 flex-shrink-0 bg-gray-800 border-l border-gray-700 flex-col overflow-hidden">

          {/* ── Dice ── */}
          <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-gray-700">
            <DiceRoller
              diceRoll={gameState.diceRoll}
              phase={phase}
              isMyTurn={isMyTurn}
            />
          </div>

          {/* ── Hand — card style matching mobile ── */}
          {localPlayer && (() => {
            const held     = ALL_RESOURCES.filter(r => (localPlayer.resources as any)[r] > 0);
            const total    = ALL_RESOURCES.reduce((s, r) => s + (localPlayer.resources as any)[r], 0);
            const devCards = localPlayer.devCards ?? [];
            return (
              <div className="flex-shrink-0 px-3 py-2 border-b border-gray-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Your Hand</span>
                  <span className={cn('text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full',
                    total > 0 ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400')}>
                    {total}
                  </span>
                </div>

                {/* Resource cards */}
                {held.length === 0
                  ? <p className="text-xs text-gray-600 italic">No resources</p>
                  : (
                    <div className="flex items-end gap-2 flex-wrap">
                      {held.map(r => (
                        <ResourceCard key={r} resource={r} count={(localPlayer.resources as any)[r]} small />
                      ))}
                    </div>
                  )
                }

                {/* Dev cards */}
                {devCards.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap pt-1 border-t border-gray-700">
                    {devCards.map((c, i) => (
                      <DevCardMini key={i} card={c} small />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Action panel — fills remaining space, no scroll ── */}
          <div className="flex-1 min-h-0 overflow-hidden p-3">
            <ActionPanel gameState={gameState} gameId={gameId!} />
          </div>

          {/* ── Log + chat — fixed compact height ── */}
          <div className="h-20 flex-shrink-0 border-t border-gray-700">
            <GameLog log={gameState.log} />
          </div>
          <div className="h-20 flex-shrink-0 border-t border-gray-700">
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

      {/* ── Mobile: compact always-visible chat input ── */}
      <MobileChatBar gameId={gameId!} />

      {/* ── Mobile: ContextBar — fixed at the very bottom ── */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-[52] bg-gray-900 border-t border-gray-700"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <ContextBar gameState={gameState} gameId={gameId!}/>
      </div>

      {/* ── Win celebration overlay ── */}
      {gameState.phase === 'GAME_OVER' && gameState.winner && (
        <WinCelebration gameState={gameState} localPlayerId={localPlayerId}/>
      )}

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

      {/* ── Reconnecting overlay ── */}
      <AnimatePresence>
        {!wsConnected && (
          <motion.div
            key="reconnecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-gray-900 border border-gray-700 rounded-2xl px-8 py-7 flex flex-col items-center gap-4 shadow-2xl"
            >
              <div className="relative size-12">
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-amber-500/30"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                  style={{ borderTopColor: '#f59e0b' }}
                />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-base">Reconnecting…</p>
                <p className="text-gray-400 text-sm mt-1">Trying to restore connection</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
