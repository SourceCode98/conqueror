import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@conqueror/shared';
import type { GameOrchestrator } from '../game/GameOrchestrator.js';
import type { ClientMeta } from './types.js';
import { handleSetupPlacement } from './actions/setupActions.js';
import { handleRollDice } from './actions/rollDice.js';
import { handlePlaceBuilding } from './actions/placeBuilding.js';
import { handlePlaceRoad } from './actions/placeRoad.js';
import { handleEndTurn } from './actions/endTurn.js';
import { handleBankTrade } from './actions/bankTrade.js';
import { handleOfferTrade, handleRespondTrade, handleAcceptPlayerTrade, handleCancelTrade } from './actions/playerTrade.js';
import { handleBuyDevCard, handlePlayDevCard } from './actions/devCards.js';
import { handleMoveBandit } from './actions/bandit.js';
import { handleDiscardCards } from './actions/discard.js';
import { handleEndGame } from './actions/endGame.js';
import { handleForceEndTurn } from './actions/forceEndTurn.js';

export interface ActionContext {
  broadcastToRoom: (msg: ServerMessage) => void;
  sendTo: (ws: WebSocket, msg: ServerMessage) => void;
  sendPrivate: (targetPlayerId: string, msg: ServerMessage) => void;
}

export function handleGameAction(
  ws: WebSocket,
  msg: ClientMessage,
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  // Validate it's this player's turn for most actions
  const isTurnBased = !['RESPOND_TRADE', 'DISCARD_CARDS', 'END_GAME', 'FORCE_END_TURN'].includes(msg.type);
  if (isTurnBased && state.activePlayerId !== meta.userId) {
    ctx.sendTo(ws, {
      type: 'ERROR',
      payload: { code: 'NOT_YOUR_TURN', message: 'It is not your turn' },
    });
    return;
  }

  try {
    switch (msg.type) {
      case 'PLACE_BUILDING':
        if (state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE') {
          handleSetupPlacement(ws, msg.payload as any, meta, orch, ctx);
        } else {
          handlePlaceBuilding(ws, msg.payload as any, meta, orch, ctx);
        }
        break;
      case 'PLACE_ROAD':
        handlePlaceRoad(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'ROLL_DICE':
        handleRollDice(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'END_TURN':
        handleEndTurn(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'BANK_TRADE':
        handleBankTrade(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'OFFER_TRADE':
        handleOfferTrade(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'RESPOND_TRADE':
        handleRespondTrade(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'ACCEPT_PLAYER_TRADE':
        handleAcceptPlayerTrade(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'CANCEL_TRADE':
        handleCancelTrade(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'BUY_DEV_CARD':
        handleBuyDevCard(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'PLAY_DEV_CARD':
        handlePlayDevCard(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'MOVE_BANDIT':
        handleMoveBandit(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'DISCARD_CARDS':
        handleDiscardCards(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'FORCE_END_TURN':
        handleForceEndTurn(ws, msg.payload as any, meta, orch, ctx);
        break;
      case 'END_GAME':
        handleEndGame(ws, msg.payload as any, meta, orch, ctx);
        break;
      default:
        ctx.sendTo(ws, {
          type: 'ERROR',
          payload: { code: 'UNKNOWN_ACTION', message: 'Unknown action type' },
        });
    }
  } catch (err) {
    console.error('Action error:', err);
    ctx.sendTo(ws, {
      type: 'ERROR',
      payload: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' },
    });
  }
}
