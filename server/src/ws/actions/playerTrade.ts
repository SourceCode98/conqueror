import { WebSocket } from 'ws';
import type { ResourceBundle } from '@conqueror/shared';
import { hasResources, addResources, subtractResources, EMPTY_RESOURCES } from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';

export function handleOfferTrade(
  ws: WebSocket,
  payload: { gameId: string; give: ResourceBundle; want: ResourceBundle },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'ACTION') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not action phase' } });
    return;
  }
  if (state.tradeOffer) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'TRADE_IN_PROGRESS', message: 'Cancel current offer first' } });
    return;
  }

  const player = state.players.find(p => p.id === meta.userId)!;
  if (!hasResources(player.resources, payload.give)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'You do not have these resources' } });
    return;
  }

  const respondents: Record<string, 'pending' | 'accept' | 'reject'> = {};
  for (const p of state.players) {
    if (p.id !== meta.userId) respondents[p.id] = 'pending';
  }

  const offer = { fromPlayerId: meta.userId, give: payload.give, want: payload.want, respondents };

  orch.updateState(s => ({ ...s, phase: 'TRADE_OFFER', tradeOffer: offer }));
  ctx.broadcastToRoom({ type: 'TRADE_OFFERED', payload: { offer } });
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleRespondTrade(
  ws: WebSocket,
  payload: { gameId: string; response: 'accept' | 'reject' },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.tradeOffer) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_TRADE_OFFER', message: 'No active trade offer' } });
    return;
  }
  if (state.tradeOffer.fromPlayerId === meta.userId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'CANT_RESPOND_OWN', message: 'Cannot respond to your own offer' } });
    return;
  }

  // Validate respondent can fulfill trade (if accepting)
  if (payload.response === 'accept') {
    const player = state.players.find(p => p.id === meta.userId)!;
    if (!hasResources(player.resources, state.tradeOffer.want)) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'You do not have resources to accept' } });
      return;
    }
  }

  orch.updateState(s => ({
    ...s,
    tradeOffer: s.tradeOffer
      ? {
          ...s.tradeOffer,
          respondents: { ...s.tradeOffer.respondents, [meta.userId]: payload.response },
        }
      : null,
  }));

  // Auto-cancel if every non-offerer has rejected — no need for offerer to manually cancel
  const updatedOffer = orch.getState().tradeOffer;
  if (updatedOffer) {
    const allRejected = Object.values(updatedOffer.respondents).every(r => r === 'reject');
    if (allRejected) {
      orch.updateState(s => ({ ...s, phase: 'ACTION', tradeOffer: null }));
      ctx.broadcastToRoom({ type: 'TRADE_RESOLVED', payload: { accepted: false } });
    }
  }

  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleAcceptPlayerTrade(
  ws: WebSocket,
  payload: { gameId: string; fromPlayerId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.tradeOffer) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_TRADE_OFFER', message: 'No active trade offer' } });
    return;
  }
  if (state.tradeOffer.respondents[payload.fromPlayerId] !== 'accept') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'PLAYER_DID_NOT_ACCEPT', message: 'That player has not accepted' } });
    return;
  }

  const { give, want } = state.tradeOffer;
  const activePlayer = state.players.find(p => p.id === meta.userId)!;
  const tradePartner = state.players.find(p => p.id === payload.fromPlayerId)!;

  if (!hasResources(activePlayer.resources, give)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'You no longer have these resources' } });
    return;
  }
  if (!hasResources(tradePartner.resources, want)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'PARTNER_INSUFFICIENT_RESOURCES', message: 'Partner no longer has these resources' } });
    return;
  }

  orch.updateState(s => ({
    ...s,
    phase: 'ACTION',
    tradeOffer: null,
    players: s.players.map(p => {
      if (p.id === meta.userId) return { ...p, resources: addResources(subtractResources(p.resources, give), want) };
      if (p.id === payload.fromPlayerId) return { ...p, resources: addResources(subtractResources(p.resources, want), give) };
      return p;
    }),
  }));

  ctx.broadcastToRoom({ type: 'TRADE_RESOLVED', payload: { accepted: true, byPlayerId: payload.fromPlayerId } });
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleCancelTrade(
  ws: WebSocket,
  payload: { gameId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.tradeOffer) return;

  // Only the offerer (or active player) can cancel
  if (state.tradeOffer.fromPlayerId !== meta.userId && state.activePlayerId !== meta.userId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_OFFERER', message: 'Only the offerer can cancel the trade' } });
    return;
  }

  orch.updateState(s => ({ ...s, phase: 'ACTION', tradeOffer: null }));
  ctx.broadcastToRoom({ type: 'TRADE_RESOLVED', payload: { accepted: false } });
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleCounterTrade(
  ws: WebSocket,
  payload: { gameId: string; give: ResourceBundle; want: ResourceBundle },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (!state.tradeOffer) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_TRADE_OFFER', message: 'No active trade offer' } });
    return;
  }
  if (state.tradeOffer.fromPlayerId === meta.userId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'CANT_COUNTER_OWN', message: 'Cannot counter your own offer' } });
    return;
  }

  const player = state.players.find(p => p.id === meta.userId)!;
  if (!hasResources(player.resources, payload.give)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'You do not have these resources' } });
    return;
  }

  const respondents: Record<string, 'pending' | 'accept' | 'reject'> = {};
  for (const p of state.players) {
    if (p.id !== meta.userId) respondents[p.id] = 'pending';
  }

  const newOffer = { fromPlayerId: meta.userId, give: payload.give, want: payload.want, respondents };

  orch.updateState(s => ({ ...s, phase: 'TRADE_OFFER', tradeOffer: newOffer }));
  ctx.broadcastToRoom({ type: 'TRADE_OFFERED', payload: { offer: newOffer } });
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
