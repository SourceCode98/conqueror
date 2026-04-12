import { WebSocket } from 'ws';
import type { DevCardType, ResourceBundle, EdgeId } from '@conqueror/shared';
import {
  hasResources,
  subtractResources,
  addResources,
  canPlaceRoad,
  recalculateSpecialCards,
  BUILD_COSTS,
  EMPTY_RESOURCES,
  ALL_RESOURCES,
} from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';
import { checkAndHandleWin } from './winCheck.js';

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
  checkAndHandleWin(orch, ctx);

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

  // Only warrior can be played before rolling
  if (state.phase === 'ROLL' && payload.cardType !== 'warrior') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Only a Warrior card can be played before rolling' } });
    return;
  }

  // Victory point cards cannot be manually played
  if (payload.cardType === 'victoryPoint') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'AUTO_VP', message: 'VP cards are revealed automatically' } });
    return;
  }

  const player = state.players.find(p => p.id === meta.userId)!;

  // Enforce 1 dev card per turn
  if (player.devCardPlayedThisTurn) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'ALREADY_PLAYED', message: 'You already played a dev card this turn' } });
    return;
  }

  const cardIdx = player.devCards.findIndex(
    c => c.type === payload.cardType && !c.playedThisTurn && !c.boughtThisTurn
  );

  if (cardIdx === -1) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_CARD', message: 'You do not have this card available to play' } });
    return;
  }

  // Validate params BEFORE removing the card so it is never lost on bad input
  if (payload.cardType === 'yearOfPlenty') {
    const resources = payload.params?.resources;
    if (!resources || resources.length !== 2) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_PARAMS', message: 'Must select 2 resources' } });
      return;
    }
    for (const r of resources) {
      if (!ALL_RESOURCES.includes(r as any)) {
        ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_RESOURCE', message: `Invalid resource: ${r}` } });
        return;
      }
    }
  }

  if (payload.cardType === 'monopoly') {
    const resource = payload.params?.resource;
    if (!resource || !ALL_RESOURCES.includes(resource as any)) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_RESOURCE', message: 'Must select a valid resource' } });
      return;
    }
  }

  if (payload.cardType === 'roadBuilding') {
    const edges: EdgeId[] = Array.isArray(payload.params?.edges) ? payload.params.edges : [];
    // Validate roads free of cost; simulate placing edge[0] before validating edge[1]
    let simState = state;
    for (const edgeId of edges.slice(0, 2)) {
      const v = canPlaceRoad(simState, meta.userId, edgeId, undefined, true);
      if (!v.valid) {
        ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_ROAD', message: v.reason! } });
        return;
      }
      // Simulate placing this road so the next edge can connect through it
      simState = { ...simState, roads: { ...simState.roads, [edgeId]: { playerId: meta.userId } } };
    }
  }

  // Remove the played card and mark player as having played this turn
  orch.updateState(s => ({
    ...s,
    players: s.players.map(p =>
      p.id === meta.userId
        ? {
            ...p,
            devCards: p.devCards.filter((_, i) => i !== cardIdx),
            devCardPlayedThisTurn: true,
          }
        : p
    ),
  }));

  let toastExtra: string | undefined;

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
      toastExtra = playMonopoly(ws, payload.params, meta, orch, ctx);
      break;
  }

  orch.addLogEntry(`log.played${payload.cardType.charAt(0).toUpperCase() + payload.cardType.slice(1)}`, { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'ACTION_TOAST', payload: { playerId: meta.userId, username: meta.username, action: `played_${payload.cardType}`, extra: toastExtra } });
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
  const edges: EdgeId[] = Array.isArray(params?.edges) ? params.edges! : [];

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
  const resources = params.resources!;
  const bonus: ResourceBundle = { ...EMPTY_RESOURCES };
  for (const r of resources) {
    (bonus as any)[r] += 1;
  }
  orch.updateState(s => ({
    ...s,
    players: s.players.map(p =>
      p.id === meta.userId ? { ...p, resources: addResources(p.resources, bonus) } : p
    ),
  }));
}

function playMonopoly(ws: WebSocket, params: { resource?: string }, meta: ClientMeta, orch: GameOrchestrator, ctx: ActionContext): string {
  const resource = params.resource!;
  let totalStolen = 0;

  orch.updateState(s => {
    let stolen = 0;
    const newPlayers = s.players.map(p => {
      if (p.id === meta.userId) return p;
      const amount = (p.resources as any)[resource] as number;
      stolen += amount;
      return { ...p, resources: { ...p.resources, [resource]: 0 } };
    });
    totalStolen = stolen;
    return {
      ...s,
      players: newPlayers.map(p =>
        p.id === meta.userId
          ? { ...p, resources: { ...p.resources, [resource]: (p.resources as any)[resource] + stolen } }
          : p
      ),
    };
  });

  return `${resource}:${totalStolen}`;
}
