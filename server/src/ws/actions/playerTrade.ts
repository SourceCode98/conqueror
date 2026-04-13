import { WebSocket } from 'ws';
import type { ResourceBundle } from '@conqueror/shared';
import { hasResources, addResources, subtractResources } from '@conqueror/shared';
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
  if (meta.userId !== state.activePlayerId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_YOUR_TURN', message: 'Only the active player can make trade offers' } });
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

  const respondents: Record<string, { status: 'pending' | 'accept' | 'reject' | 'counter'; give?: ResourceBundle; want?: ResourceBundle }> = {};
  for (const p of state.players) {
    if (p.id !== meta.userId) respondents[p.id] = { status: 'pending' };
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
      ? { ...s.tradeOffer, respondents: { ...s.tradeOffer.respondents, [meta.userId]: { status: payload.response } } }
      : null,
  }));

  // Auto-cancel if everyone rejected (no counter-offers either)
  const updatedOffer = orch.getState().tradeOffer;
  if (updatedOffer) {
    const allRejected = Object.values(updatedOffer.respondents).every(r => r.status === 'reject');
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
  // Only the active player (turn owner) can confirm trades
  if (meta.userId !== state.activePlayerId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_ACTIVE_PLAYER', message: 'Only the active player can confirm trades' } });
    return;
  }

  const respondent = state.tradeOffer.respondents[payload.fromPlayerId];
  if (!respondent || (respondent.status !== 'accept' && respondent.status !== 'counter')) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'PLAYER_DID_NOT_ACCEPT', message: 'That player has not accepted or counter-offered' } });
    return;
  }

  // For a normal accept: active player gives offer.give, receives offer.want
  // For a counter: active player gives respondent.want, receives respondent.give
  const activeGives: ResourceBundle  = respondent.status === 'counter' ? respondent.want!  : state.tradeOffer.give;
  const activeGets:  ResourceBundle  = respondent.status === 'counter' ? respondent.give!  : state.tradeOffer.want;

  const activePlayer  = state.players.find(p => p.id === meta.userId)!;
  const tradePartner  = state.players.find(p => p.id === payload.fromPlayerId)!;

  if (!hasResources(activePlayer.resources, activeGives)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'You no longer have these resources' } });
    return;
  }
  if (!hasResources(tradePartner.resources, activeGets)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'PARTNER_INSUFFICIENT_RESOURCES', message: 'Partner no longer has these resources' } });
    return;
  }

  orch.updateState(s => ({
    ...s,
    phase: 'ACTION',
    tradeOffer: null,
    players: s.players.map(p => {
      if (p.id === meta.userId)          return { ...p, resources: addResources(subtractResources(p.resources, activeGives), activeGets) };
      if (p.id === payload.fromPlayerId) return { ...p, resources: addResources(subtractResources(p.resources, activeGets),  activeGives) };
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

  if (state.tradeOffer.fromPlayerId !== meta.userId && state.activePlayerId !== meta.userId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_OFFERER', message: 'Only the offerer can cancel the trade' } });
    return;
  }

  orch.updateState(s => ({ ...s, phase: 'ACTION', tradeOffer: null }));
  ctx.broadcastToRoom({ type: 'TRADE_RESOLVED', payload: { accepted: false } });
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleRejectCounterOffer(
  ws: WebSocket,
  payload: { gameId: string; playerId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.tradeOffer) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_TRADE_OFFER', message: 'No active trade offer' } });
    return;
  }
  if (meta.userId !== state.activePlayerId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_ACTIVE_PLAYER', message: 'Only the active player can reject counter-offers' } });
    return;
  }
  const respondent = state.tradeOffer.respondents[payload.playerId];
  if (!respondent || respondent.status !== 'counter') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_A_COUNTER', message: 'That player has not counter-offered' } });
    return;
  }

  orch.updateState(s => ({
    ...s,
    tradeOffer: s.tradeOffer ? {
      ...s.tradeOffer,
      respondents: { ...s.tradeOffer.respondents, [payload.playerId]: { status: 'rejected_by_offerer' } },
    } : null,
  }));

  // Auto-cancel if all are rejected/rejected_by_offerer
  const updated = orch.getState().tradeOffer;
  if (updated) {
    const allDone = Object.values(updated.respondents).every(r => r.status === 'reject' || r.status === 'rejected_by_offerer');
    if (allDone) {
      orch.updateState(s => ({ ...s, phase: 'ACTION', tradeOffer: null }));
      ctx.broadcastToRoom({ type: 'TRADE_RESOLVED', payload: { accepted: false } });
    }
  }

  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleModifyOfferGive(
  ws: WebSocket,
  payload: { gameId: string; give: ResourceBundle },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.tradeOffer) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_TRADE_OFFER', message: 'No active trade offer' } });
    return;
  }
  if (meta.userId !== state.activePlayerId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_ACTIVE_PLAYER', message: 'Only the active player can modify the offer' } });
    return;
  }
  const player = state.players.find(p => p.id === meta.userId)!;
  if (!hasResources(player.resources, payload.give)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'You do not have these resources' } });
    return;
  }

  // Update offer.give and reset all respondents to pending (fresh round with new terms)
  const freshRespondents: Record<string, { status: 'pending' }> = {};
  for (const id of Object.keys(state.tradeOffer.respondents)) {
    freshRespondents[id] = { status: 'pending' };
  }

  orch.updateState(s => ({
    ...s,
    tradeOffer: s.tradeOffer ? { ...s.tradeOffer, give: payload.give, respondents: freshRespondents } : null,
  }));

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
  if (!(meta.userId in state.tradeOffer.respondents)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_IN_TRADE', message: 'You are not part of this trade' } });
    return;
  }

  const player = state.players.find(p => p.id === meta.userId)!;
  if (!hasResources(player.resources, payload.give)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'You do not have these resources' } });
    return;
  }

  // Update only this player's respondent entry — other responses are preserved
  orch.updateState(s => ({
    ...s,
    tradeOffer: s.tradeOffer
      ? {
          ...s.tradeOffer,
          respondents: {
            ...s.tradeOffer.respondents,
            [meta.userId]: { status: 'counter', give: payload.give, want: payload.want },
          },
        }
      : null,
  }));

  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
