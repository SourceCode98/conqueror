import { WebSocket } from 'ws';
import type { DevCardType, ResourceBundle, EdgeId } from '@conqueror/shared';
import {
  hasResources,
  subtractResources,
  addResources,
  canPlaceRoad,
  recalculateSpecialCards,
  checkWinCondition,
  BUILD_COSTS,
  EMPTY_RESOURCES,
  ALL_RESOURCES,
} from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';

export function handleBuyDevCard(
  ws: WebSocket,
  payload: { gameId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'ACTION') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not action phase' } });
    return;
  }

  const player = state.players.find(p => p.id === meta.userId)!;
  if (!hasResources(player.resources, BUILD_COSTS.devCard)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'Insufficient resources' } });
    return;
  }
  if (state.devCardDeck.length === 0) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'DECK_EMPTY', message: 'No development cards remaining' } });
    return;
  }

  // Draw the top card
  const drawnCard = state.devCardDeck[state.devCardDeck.length - 1];

  orch.updateState(s => ({
    ...s,
    devCardDeck: s.devCardDeck.slice(0, -1),
    players: s.players.map(p =>
      p.id === meta.userId
        ? {
            ...p,
            resources: subtractResources(p.resources, BUILD_COSTS.devCard),
            devCards: [...p.devCards, { type: drawnCard, playedThisTurn: false, boughtThisTurn: true }],
            victoryPointCards: drawnCard === 'victoryPoint' ? p.victoryPointCards + 1 : p.victoryPointCards,
          }
        : p
    ),
  }));

  // Send the drawn card only to the drawing player
  ctx.sendPrivate(meta.userId, { type: 'DEV_CARD_DRAWN', payload: { cardType: drawnCard } });

  // Check win condition (in case of VP card)
  const winner = checkWinCondition(orch.getState());
  if (winner) {
    orch.updateState(s => ({ ...s, phase: 'GAME_OVER', winner }));
    const finalScores: Record<string, number> = {};
    for (const p of orch.getState().players) finalScores[p.id] = p.victoryPoints + p.victoryPointCards;
    ctx.broadcastToRoom({ type: 'GAME_OVER', payload: { winnerId: winner, finalScores } });
  }

  orch.addLogEntry('log.boughtDevCard', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'ACTION_TOAST', payload: { playerId: meta.userId, username: meta.username, action: 'boughtDevCard' } });
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handlePlayDevCard(
  ws: WebSocket,
  payload: { gameId: string; cardType: DevCardType; params?: any },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'ACTION' && state.phase !== 'ROLL') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Cannot play dev card now' } });
    return;
  }

  const player = state.players.find(p => p.id === meta.userId)!;
  const cardIdx = player.devCards.findIndex(
    c => c.type === payload.cardType && !c.playedThisTurn && !c.boughtThisTurn
  );

  if (cardIdx === -1) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_CARD', message: 'You do not have this card or already played one this turn' } });
    return;
  }

// Remove the played card
orch.updateState(s => ({
  ...s,
  players: s.players.map(p =>
    p.id === meta.userId
      ? {
          ...p,
          devCards: p.devCards.filter((_, i) => i !== cardIdx),
        }
      : p
  ),
}));

  switch (payload.cardType) {
    case 'warrior':
      playWarrior(ws, meta, orch, ctx);
      break;
    case 'roadBuilding':
      playRoadBuilding(ws, payload.params, meta, orch, ctx);
      break;
    case 'yearOfPlenty':
      playYearOfPlenty(ws, payload.params, meta, orch, ctx);
      break;
    case 'monopoly':
      playMonopoly(ws, payload.params, meta, orch, ctx);
      break;
    case 'victoryPoint':
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'AUTO_VP', message: 'VP cards are revealed automatically' } });
      return;
  }

  orch.addLogEntry(`log.played${payload.cardType.charAt(0).toUpperCase() + payload.cardType.slice(1)}`, { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

function playWarrior(ws: WebSocket, meta: ClientMeta, orch: GameOrchestrator, ctx: ActionContext): void {
  orch.updateState(s => ({
    ...s,
    phase: 'ROBBER',
    players: s.players.map(p =>
      p.id === meta.userId ? { ...p, knightsPlayed: p.knightsPlayed + 1 } : p
    ),
  }));
  // Supreme Army recalculated after bandit is moved
}

function playRoadBuilding(ws: WebSocket, params: { edges?: EdgeId[] }, meta: ClientMeta, orch: GameOrchestrator, ctx: ActionContext): void {
  const edges = params?.edges ?? [];
  const state = orch.getState();

  // Validate and place up to 2 roads for free
  for (const edgeId of edges.slice(0, 2)) {
    const v = canPlaceRoad(state, meta.userId, edgeId);
    if (!v.valid) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_ROAD', message: v.reason! } });
      return;
    }
  }

  orch.updateState(s => {
    let newRoads = { ...s.roads };
    let players = s.players;
    for (const edgeId of edges.slice(0, 2)) {
      newRoads[edgeId] = { playerId: meta.userId };
      players = players.map(p =>
        p.id === meta.userId ? { ...p, roadsLeft: p.roadsLeft - 1 } : p
      );
    }
    return { ...s, roads: newRoads, players: recalculateSpecialCards({ ...s, roads: newRoads, players }) };
  });
}

function playYearOfPlenty(ws: WebSocket, params: { resources?: [string, string] }, meta: ClientMeta, orch: GameOrchestrator, ctx: ActionContext): void {
  const resources = params?.resources;
  if (!resources || resources.length !== 2) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_PARAMS', message: 'Must select 2 resources' } });
    return;
  }
  const bonus: ResourceBundle = { ...EMPTY_RESOURCES };
  for (const r of resources) {
    if (!ALL_RESOURCES.includes(r as any)) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_RESOURCE', message: `Invalid resource: ${r}` } });
      return;
    }
    (bonus as any)[r] += 1;
  }
  orch.updateState(s => ({
    ...s,
    players: s.players.map(p =>
      p.id === meta.userId ? { ...p, resources: addResources(p.resources, bonus) } : p
    ),
  }));
}

function playMonopoly(ws: WebSocket, params: { resource?: string }, meta: ClientMeta, orch: GameOrchestrator, ctx: ActionContext): void {
  const resource = params?.resource;
  if (!resource || !ALL_RESOURCES.includes(resource as any)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_RESOURCE', message: 'Must select a valid resource' } });
    return;
  }

  orch.updateState(s => {
    let totalStolen = 0;
    const newPlayers = s.players.map(p => {
      if (p.id === meta.userId) return p;
      const amount = (p.resources as any)[resource] as number;
      totalStolen += amount;
      return { ...p, resources: { ...p.resources, [resource]: 0 } };
    });
    return {
      ...s,
      players: newPlayers.map(p =>
        p.id === meta.userId
          ? { ...p, resources: { ...p.resources, [resource]: (p.resources as any)[resource] + totalStolen } }
          : p
      ),
    };
  });
}
