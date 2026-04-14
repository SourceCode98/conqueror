import { WebSocket } from 'ws';
import type { VertexId, EdgeId } from '@conqueror/shared';
import {
  hasResources, subtractResources,
  SOLDIER_COST, MAX_SOLDIERS_SETTLEMENT, MAX_SOLDIERS_CITY,
  WAR_RECONSTRUCT_COST,
  roadDistanceToVertex, vertexToVertexDistance, countPlayerSoldiers, updateWarlord, edgeVertices, hexVertexIds,
  recalculateSpecialCards,
} from '@conqueror/shared';
import type { GameOrchestrator, PendingCombat, PendingColiseum } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';
import { checkAndHandleWin } from './winCheck.js';

const MAX_ATTACK_DISTANCE = 2;
const COMBAT_ROLL_TIMEOUT_MS = 12000;

// gameId → timeout handle for auto-roll
const combatTimers = new Map<string, ReturnType<typeof setTimeout>>();

function err(ctx: ActionContext, ws: WebSocket, code: string, message: string) {
  ctx.sendTo(ws, { type: 'ERROR', payload: { code, message } });
}

/**
 * After transferring adjacent roads, flood-fill through remaining victim roads.
 * Any victim road not reachable from a remaining victim building is also transferred
 * to the attacker (orphaned road chain).
 */
function transferOrphanedRoads(
  roads: Record<string, any>,
  buildings: Record<string, any>,
  victimId: string,
  attackerId: string,
): Record<string, any> {
  // Seed BFS with vertices that still have a victim building
  const seeds = Object.entries(buildings)
    .filter(([, b]) => b.playerId === victimId)
    .map(([vid]) => vid);

  const connectedEdges = new Set<string>();
  const visited = new Set<string>(seeds);
  const queue = [...seeds];

  while (queue.length > 0) {
    const v = queue.shift()!;
    for (const [edgeId, road] of Object.entries(roads)) {
      if ((road as any).playerId !== victimId) continue;
      if (connectedEdges.has(edgeId)) continue;
      const [v1, v2] = edgeVertices(edgeId as EdgeId);
      const neighbor = v1 === v ? v2 : v2 === v ? v1 : null;
      if (neighbor === null) continue;
      connectedEdges.add(edgeId);
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const newRoads = { ...roads };
  for (const [edgeId, road] of Object.entries(roads)) {
    if ((road as any).playerId !== victimId) continue;
    if (!connectedEdges.has(edgeId)) {
      (newRoads as any)[edgeId] = { playerId: attackerId };
    }
  }
  return newRoads;
}

export function handleRecruitSoldier(
  ws: WebSocket,
  payload: { gameId: string; vertexId: VertexId },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.warMode) return;
  if (state.phase !== 'ACTION') { err(ctx, ws, 'WRONG_PHASE', 'Can only recruit in ACTION phase'); return; }

  const building = state.buildings[payload.vertexId];
  if (!building) { err(ctx, ws, 'NO_BUILDING', 'No building at that location'); return; }
  if (building.playerId !== meta.userId) { err(ctx, ws, 'NOT_YOUR_BUILDING', 'Not your building'); return; }
  if (building.sieged) { err(ctx, ws, 'BESIEGED', 'Cannot recruit to a besieged building'); return; }

  const max = building.type === 'city' ? MAX_SOLDIERS_CITY : MAX_SOLDIERS_SETTLEMENT;
  if ((building.soldiers ?? 0) >= max) { err(ctx, ws, 'AT_CAPACITY', `Max ${max} soldiers here`); return; }

  const me = state.players.find(p => p.id === meta.userId)!;
  const useFree = (me.freeSoldiers ?? 0) > 0;
  if (!useFree && !hasResources(me.resources, SOLDIER_COST)) { err(ctx, ws, 'INSUFFICIENT_RESOURCES', 'Need 1 iron, 1 grain, 1 wool'); return; }

  orch.updateState(s => ({
    ...s,
    players: s.players.map(p => p.id === meta.userId
      ? useFree
        ? { ...p, freeSoldiers: (p.freeSoldiers ?? 1) - 1 }
        : { ...p, resources: subtractResources(p.resources, SOLDIER_COST) }
      : p),
    buildings: {
      ...s.buildings,
      [payload.vertexId]: { ...building, soldiers: (building.soldiers ?? 0) + 1 },
    },
  }));

  orch.addLogEntry('log.recruitedSoldier', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleTransferSoldiers(
  ws: WebSocket,
  payload: { gameId: string; fromVertexId: VertexId; toVertexId: VertexId; count: number },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.warMode) return;
  if (state.phase !== 'ACTION') { err(ctx, ws, 'WRONG_PHASE', 'Can only transfer soldiers in ACTION phase'); return; }
  if ((state.transfersUsedThisTurn ?? 0) >= 2) { err(ctx, ws, 'TRANSFER_LIMIT', 'Solo se pueden mover soldados 2 veces por turno'); return; }

  const { fromVertexId, toVertexId, count } = payload;
  if (fromVertexId === toVertexId) { err(ctx, ws, 'SAME_VERTEX', 'Source and destination must differ'); return; }
  if (!Number.isInteger(count) || count < 1) { err(ctx, ws, 'INVALID_COUNT', 'Count must be at least 1'); return; }

  const from = state.buildings[fromVertexId];
  const to   = state.buildings[toVertexId];
  if (!from || from.playerId !== meta.userId) { err(ctx, ws, 'NOT_OWNER', 'Source building not yours'); return; }
  if (!to   || to.playerId   !== meta.userId) { err(ctx, ws, 'NOT_OWNER', 'Destination building not yours'); return; }

  const available = from.soldiers ?? 0;
  if (count > available) { err(ctx, ws, 'NOT_ENOUGH_SOLDIERS', `Only ${available} soldiers available`); return; }

  const maxDest = to.type === 'city' ? MAX_SOLDIERS_CITY : MAX_SOLDIERS_SETTLEMENT;
  const free    = maxDest - (to.soldiers ?? 0);
  if (free <= 0) { err(ctx, ws, 'DEST_FULL', 'Destination building is at soldier capacity'); return; }

  const maxDist = 2 + (state.transferDistanceBonus ?? 0);
  const dist = vertexToVertexDistance(state, fromVertexId, toVertexId);
  if (dist > maxDist) { err(ctx, ws, 'TOO_FAR', `Buildings must be within ${maxDist} road-steps`); return; }

  const move = Math.min(count, free);
  orch.updateState(s => ({
    ...s,
    buildings: {
      ...s.buildings,
      [fromVertexId]: { ...s.buildings[fromVertexId as any], soldiers: available - move },
      [toVertexId]:   { ...s.buildings[toVertexId   as any], soldiers: (to.soldiers ?? 0) + move },
    },
    transfersUsedThisTurn: (s.transfersUsedThisTurn ?? 0) + 1,
  }));

  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleAttack(
  ws: WebSocket,
  payload: { gameId: string; targetVertexId: VertexId; soldiers: number },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.warMode) return;
  if (state.phase !== 'ACTION') { err(ctx, ws, 'WRONG_PHASE', 'Can only attack in ACTION phase'); return; }

  if (!state.warVariants?.totalWar && state.attackUsedThisTurn) {
    err(ctx, ws, 'ATTACK_USED', 'Only 1 attack per turn'); return;
  }

  // Block if a combat is already waiting for rolls
  if (orch.getPendingCombat()) {
    err(ctx, ws, 'COMBAT_IN_PROGRESS', 'A combat is already in progress'); return;
  }

  const targetBuilding = state.buildings[payload.targetVertexId];
  if (!targetBuilding) { err(ctx, ws, 'NO_BUILDING', 'No building at target'); return; }
  if (targetBuilding.playerId === meta.userId) { err(ctx, ws, 'OWN_BUILDING', 'Cannot attack own building'); return; }

  const victim = state.players.find(p => p.id === targetBuilding.playerId)!;
  const victimVP = victim.victoryPoints + victim.victoryPointCards;
  if (victimVP <= 2) { err(ctx, ws, 'PROTECTED', 'Cannot attack a player with 2 or fewer VP'); return; }

  const dist = roadDistanceToVertex(state, meta.userId, payload.targetVertexId);
  if (dist > MAX_ATTACK_DISTANCE) { err(ctx, ws, 'OUT_OF_RANGE', 'Target is more than 2 roads away'); return; }

  const totalAttackerSoldiers = countPlayerSoldiers(state.buildings, meta.userId);
  if (payload.soldiers < 1) { err(ctx, ws, 'NO_SOLDIERS', 'Need at least 1 soldier to attack'); return; }
  if (payload.soldiers > totalAttackerSoldiers) { err(ctx, ws, 'NOT_ENOUGH_SOLDIERS', 'Not enough soldiers'); return; }
  if (!targetBuilding.sieged && payload.soldiers < 2) {
    err(ctx, ws, 'NEED_TWO_SOLDIERS', 'Need at least 2 soldiers to besiege a building'); return;
  }

  // ── Coliseum mode: replace dice combat with 1v1 mini-game ──────────────────
  if (state.warVariants?.coliseum) {
    const now = Date.now();
    orch.updateState(s => ({
      ...s,
      attackUsedThisTurn: true,
      phase: 'COLISEUM_BATTLE',
      coliseumBattle: {
        attackerId: meta.userId,
        defenderId: victim.id,
        attackerScore: 0,
        defenderScore: 0,
        attackerHp: COLISEUM_MAX_HP,
        defenderHp: COLISEUM_MAX_HP + Math.min(2, targetBuilding?.soldiers ?? 0) * COLISEUM_SOLDIER_HP_BONUS,
      },
    }));
    orch.setPendingColiseum({
      attackerId: meta.userId,
      defenderId: victim.id,
      attackerName: meta.username,
      defenderName: victim.username,
      targetVertexId: payload.targetVertexId,
      attackSoldiers: payload.soldiers,
      playerStates: {
        [meta.userId]: { x: -3.5, z: 0, rotation: Math.PI / 2, shielding: false, swinging: false, lastUpdate: now },
        [victim.id]:   { x:  3.5, z: 0, rotation: -Math.PI / 2, shielding: false, swinging: false, lastUpdate: now },
      },
      attackCooldowns: {},
      battleStartedAt: now,
      preBattleTurnStartTime: state.turnStartTime,
    });
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  // Pre-compute combat (hidden from clients until they roll)
  const attackerDie = Math.floor(Math.random() * 6) + 1;
  const defenderDie = Math.floor(Math.random() * 6) + 1;
  const defenderSoldiers = targetBuilding.soldiers ?? 0;
  const cityBonus = targetBuilding.type === 'city' ? 1 : 0;
  const garrisonBonus = defenderSoldiers >= 2 ? 1 : 0;
  const attackerForce = payload.soldiers + attackerDie;
  const defenderForce = defenderSoldiers + cityBonus + garrisonBonus + defenderDie;
  const attackerWon = attackerForce > defenderForce;

  const victimBuildingCount = Object.values(state.buildings).filter(b => b.playerId === victim.id).length;
  const canDestroy = victimBuildingCount > 1;
  const effect: PendingCombat['effect'] = !attackerWon ? 'repelled'
    : !targetBuilding.sieged ? 'siege'
    : canDestroy ? 'destruction_choice'
    : 'repelled';

  orch.updateState(s => ({ ...s, attackUsedThisTurn: true }));
  orch.setPendingCombat({
    attackerId: meta.userId,
    defenderId: victim.id,
    attackerName: meta.username,
    defenderName: victim.username,
    attackerDie, defenderDie,
    attackSoldiers: payload.soldiers,
    defenderSoldiers, cityBonus, garrisonBonus,
    attackerForce, defenderForce, attackerWon, effect,
    targetVertexId: payload.targetVertexId,
    attackerRolled: false,
    defenderRolled: false,
  });

  // Start auto-roll timeout
  const gameId = payload.gameId;
  const timer = setTimeout(() => {
    combatTimers.delete(gameId);
    const pending = orch.getPendingCombat();
    if (!pending) return;
    if (!pending.attackerRolled) {
      pending.attackerRolled = true;
      ctx.broadcastToRoom({ type: 'COMBAT_DIE_REVEALED', payload: { side: 'attacker', value: pending.attackerDie } });
    }
    if (!pending.defenderRolled) {
      pending.defenderRolled = true;
      ctx.broadcastToRoom({ type: 'COMBAT_DIE_REVEALED', payload: { side: 'defender', value: pending.defenderDie } });
    }
    applyCombatResult(orch, ctx);
  }, COMBAT_ROLL_TIMEOUT_MS);
  combatTimers.set(gameId, timer);

  ctx.broadcastToRoom({
    type: 'COMBAT_DICE_PHASE',
    payload: {
      attackerId: meta.userId,
      defenderId: victim.id,
      attackerName: meta.username,
      defenderName: victim.username,
      timeoutSecs: COMBAT_ROLL_TIMEOUT_MS / 1000,
    },
  });
}

export function handleCombatRoll(
  ws: WebSocket,
  payload: { gameId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const pending = orch.getPendingCombat();
  if (!pending) { err(ctx, ws, 'NO_COMBAT', 'No combat in progress'); return; }

  const isAttacker = meta.userId === pending.attackerId;
  const isDefender = meta.userId === pending.defenderId;
  if (!isAttacker && !isDefender) { err(ctx, ws, 'NOT_COMBATANT', 'You are not part of this combat'); return; }

  if (isAttacker && !pending.attackerRolled) {
    pending.attackerRolled = true;
    ctx.broadcastToRoom({ type: 'COMBAT_DIE_REVEALED', payload: { side: 'attacker', value: pending.attackerDie } });
  } else if (isDefender && !pending.defenderRolled) {
    pending.defenderRolled = true;
    ctx.broadcastToRoom({ type: 'COMBAT_DIE_REVEALED', payload: { side: 'defender', value: pending.defenderDie } });
  }

  if (pending.attackerRolled && pending.defenderRolled) {
    const timer = combatTimers.get(payload.gameId);
    if (timer) { clearTimeout(timer); combatTimers.delete(payload.gameId); }
    applyCombatResult(orch, ctx);
  }
}

function applyCombatResult(orch: GameOrchestrator, ctx: ActionContext): void {
  const pending = orch.getPendingCombat();
  if (!pending) return;
  orch.clearPendingCombat();

  const state = orch.getState();
  const targetBuilding = state.buildings[pending.targetVertexId as VertexId];

  const combatPayload = {
    attackerForce: pending.attackerForce,
    defenderForce: pending.defenderForce,
    attackerWon: pending.attackerWon,
    effect: pending.effect,
    attackerName: pending.attackerName,
    defenderName: pending.defenderName,
    attackerDie: pending.attackerDie,
    defenderDie: pending.defenderDie,
    attackSoldiers: pending.attackSoldiers,
    defenderSoldiers: pending.defenderSoldiers,
    cityBonus: pending.cityBonus,
    garrisonBonus: pending.garrisonBonus,
  };

  if (!pending.attackerWon) {
    // Attacker loses soldiers on repel: all of them, except if attacked with 3 → loses only 1
    const lossCount = pending.attackSoldiers === 3 ? 1 : pending.attackSoldiers;
    if (lossCount > 0) {
      orch.updateState(s => {
        const newBuildings = { ...s.buildings };
        let toRemove = lossCount;
        for (const vid of Object.keys(newBuildings)) {
          if (toRemove <= 0) break;
          const b = newBuildings[vid] as any;
          if (b.playerId === pending.attackerId && (b.soldiers ?? 0) > 0) {
            const remove = Math.min(b.soldiers, toRemove);
            newBuildings[vid] = { ...b, soldiers: b.soldiers - remove };
            toRemove -= remove;
          }
        }
        return { ...s, buildings: newBuildings as any };
      });
    }
    orch.addLogEntry('log.attackRepelled', { attacker: pending.attackerName, defender: pending.defenderName }, pending.attackerId);
    ctx.broadcastToRoom({ type: 'COMBAT_RESULT', payload: combatPayload });
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  if (!targetBuilding) {
    ctx.broadcastToRoom({ type: 'COMBAT_RESULT', payload: combatPayload });
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  const victimBuildingCount = Object.values(state.buildings).filter(b => b.playerId === pending.defenderId).length;
  const canDestroy = victimBuildingCount > 1;

  if (!targetBuilding.sieged) {
    orch.updateState(s => ({
      ...s,
      buildings: { ...s.buildings, [pending.targetVertexId]: { ...targetBuilding, sieged: true, siegedBy: pending.attackerId, siegedAtTurn: s.turn } },
    }));
    orch.addLogEntry('log.siegeStarted', { attacker: pending.attackerName, defender: pending.defenderName }, pending.attackerId);
    ctx.broadcastToRoom({ type: 'COMBAT_RESULT', payload: { ...combatPayload, effect: 'siege' } });
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
  } else if (!canDestroy) {
    // Effectively repelled (last building) — attacker still loses soldiers
    const lossCount2 = pending.attackSoldiers === 3 ? 1 : pending.attackSoldiers;
    if (lossCount2 > 0) {
      orch.updateState(s => {
        const newBuildings = { ...s.buildings };
        let toRemove = lossCount2;
        for (const vid of Object.keys(newBuildings)) {
          if (toRemove <= 0) break;
          const b = newBuildings[vid] as any;
          if (b.playerId === pending.attackerId && (b.soldiers ?? 0) > 0) {
            const remove = Math.min(b.soldiers, toRemove);
            newBuildings[vid] = { ...b, soldiers: b.soldiers - remove };
            toRemove -= remove;
          }
        }
        return { ...s, buildings: newBuildings as any };
      });
    }
    ctx.broadcastToRoom({ type: 'COMBAT_RESULT', payload: { ...combatPayload, effect: 'repelled' } });
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
  } else {
    orch.updateState(s => ({
      ...s,
      phase: 'WAR_DESTRUCTION',
      pendingDestruction: { targetVertex: pending.targetVertexId, attackerId: pending.attackerId },
    }));
    ctx.broadcastToRoom({ type: 'COMBAT_RESULT', payload: { ...combatPayload, effect: 'destruction_choice' } });
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
  }
}

export function handleChooseDestruction(
  ws: WebSocket,
  payload: { gameId: string; destructionType: 'destroy' | 'downgrade' },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.warMode) return;
  if (state.phase !== 'WAR_DESTRUCTION') { err(ctx, ws, 'WRONG_PHASE', 'Not in destruction phase'); return; }
  if (state.pendingDestruction?.attackerId !== meta.userId) { err(ctx, ws, 'NOT_ATTACKER', 'Only the attacker chooses destruction'); return; }

  const { targetVertex } = state.pendingDestruction!;
  const targetBuilding = state.buildings[targetVertex as VertexId];
  if (!targetBuilding) { err(ctx, ws, 'NO_BUILDING', 'Building no longer exists'); return; }

  const victimId = targetBuilding.playerId;
  const victim = state.players.find(p => p.id === victimId)!;
  const victimBuildingCount = Object.values(state.buildings).filter(b => b.playerId === victimId).length;

  if (victimBuildingCount <= 1) { err(ctx, ws, 'LAST_BUILDING', 'Cannot destroy the last building of a player'); return; }

  const { destructionType } = payload;

  if (destructionType === 'destroy') {
    if (targetBuilding.type !== 'settlement') { err(ctx, ws, 'INVALID_OPTION', 'Can only destroy settlements'); return; }

    orch.updateState(s => {
      const newBuildings = { ...s.buildings } as Record<string, any>;
      delete newBuildings[targetVertex];

      const db2 = { ...(s.destroyedByPlayer ?? {}) };
      db2[meta.userId] = {
        settlements: (db2[meta.userId]?.settlements ?? 0) + 1,
        cities: db2[meta.userId]?.cities ?? 0,
      };

      const players = s.players.map(p =>
        p.id === victimId
          ? { ...p, settlementsLeft: p.settlementsLeft + 1, victoryPoints: p.victoryPoints - 1 }
          : p,
      );

      const destroyedVertices = s.warVariants?.reconstruction
        ? { ...(s.destroyedVertices ?? {}), [targetVertex]: victimId }
        : s.destroyedVertices;

      // Transfer adjacent victim roads to attacker
      let newRoads = { ...s.roads } as Record<string, any>;
      for (const [edgeId, road] of Object.entries(s.roads)) {
        if (road.playerId !== victimId) continue;
        const [v1, v2] = edgeVertices(edgeId as EdgeId);
        if (v1 === targetVertex || v2 === targetVertex) {
          newRoads[edgeId] = { playerId: meta.userId };
        }
      }

      // Transfer orphaned victim roads (chains no longer connected to any victim building)
      newRoads = transferOrphanedRoads(newRoads, newBuildings, victimId, meta.userId);

      const intermediate = updateWarlord({
        ...s,
        buildings: newBuildings,
        roads: newRoads as any,
        players,
        destroyedByPlayer: db2,
        destroyedVertices,
        pendingDestruction: null,
        phase: 'ACTION',
      });
      return { ...intermediate, players: recalculateSpecialCards(intermediate) };
    });

  } else if (destructionType === 'downgrade') {
    if (targetBuilding.type !== 'city') { err(ctx, ws, 'INVALID_OPTION', 'Can only downgrade cities'); return; }

    const fortressHits = state.fortressHits ?? {};
    const hits = fortressHits[targetVertex] ?? 0;

    if (state.warVariants?.fortress && hits < 1) {
      // First hit with fortress variant — need 2 wins to downgrade
      orch.updateState(s => ({
        ...s,
        fortressHits: { ...(s.fortressHits ?? {}), [targetVertex]: hits + 1 },
        pendingDestruction: null,
        phase: 'ACTION',
      }));
      orch.addLogEntry('log.fortressHit', { attacker: meta.username, defender: victim.username }, meta.userId);
      ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
      return;
    }

    orch.updateState(s => {
      const db2 = { ...(s.destroyedByPlayer ?? {}) };
      db2[meta.userId] = {
        settlements: db2[meta.userId]?.settlements ?? 0,
        cities: (db2[meta.userId]?.cities ?? 0) + 1,
      };

      const newFortressHits = { ...(s.fortressHits ?? {}) };
      delete newFortressHits[targetVertex];

      const players = s.players.map(p =>
        p.id === victimId
          ? {
              ...p,
              citiesLeft: p.citiesLeft + 1,
              settlementsLeft: p.settlementsLeft - 1,
              victoryPoints: p.victoryPoints - 1,
            }
          : p,
      );
      const newSoldiers = Math.min(targetBuilding.soldiers ?? 0, MAX_SOLDIERS_SETTLEMENT);

      const newBuildings = {
        ...s.buildings,
        [targetVertex]: {
          type: 'settlement',
          playerId: victimId,
          soldiers: newSoldiers,
          sieged: false,
          siegedBy: null,
        },
      } as Record<string, any>;

      // Transfer adjacent victim roads to attacker
      let newRoads = { ...s.roads } as Record<string, any>;
      for (const [edgeId, road] of Object.entries(s.roads)) {
        if (road.playerId !== victimId) continue;
        const [v1, v2] = edgeVertices(edgeId as EdgeId);
        if (v1 === targetVertex || v2 === targetVertex) {
          newRoads[edgeId] = { playerId: meta.userId };
        }
      }

      // Transfer orphaned victim roads (chains no longer connected to any victim building)
      newRoads = transferOrphanedRoads(newRoads, newBuildings, victimId, meta.userId);

      const intermediate = updateWarlord({
        ...s,
        buildings: newBuildings as any,
        roads: newRoads as any,
        players,
        destroyedByPlayer: db2,
        fortressHits: newFortressHits,
        pendingDestruction: null,
        phase: 'ACTION',
      });
      return { ...intermediate, players: recalculateSpecialCards(intermediate) };
    });

  } else {
    err(ctx, ws, 'INVALID_DESTRUCTION_TYPE', 'Invalid destruction type'); return;
  }

  orch.addLogEntry(
    'log.destructionApplied',
    { attacker: meta.username, defender: victim.username, type: destructionType },
    meta.userId,
  );

  if (checkAndHandleWin(orch, ctx)) {
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

// ─── Coliseum Battle Handlers (Real-time 3D) ──────────────────────────────────

const COLISEUM_ATTACK_RANGE = 2.8;
const COLISEUM_ATTACK_COOLDOWN_MS = 900;
const COLISEUM_WIN_SCORE = 3;  // rounds to win the match
const COLISEUM_MAX_HP = 100;
const COLISEUM_HIT_DAMAGE = 34; // ~3 hits to drain HP bar
const COLISEUM_SOLDIER_HP_BONUS = 30; // each garrisoned soldier gives defender +30 HP/round
const ARENA_RADIUS_SRV = 10.5;

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function handleColiseumPlayerUpdate(
  ws: WebSocket,
  payload: { gameId: string; x: number; z: number; rotation: number; shielding: boolean; swinging: boolean },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (state.phase !== 'COLISEUM_BATTLE') return;
  const pending = orch.getPendingColiseum();
  if (!pending) return;
  if (meta.userId !== pending.attackerId && meta.userId !== pending.defenderId) return;

  // Clamp position to arena
  const dist = Math.sqrt(payload.x ** 2 + payload.z ** 2);
  const scale = dist > ARENA_RADIUS_SRV ? ARENA_RADIUS_SRV / dist : 1;
  pending.playerStates[meta.userId] = {
    x: payload.x * scale,
    z: payload.z * scale,
    rotation: payload.rotation,
    shielding: payload.shielding,
    swinging: payload.swinging,
    lastUpdate: Date.now(),
  };

  ctx.broadcastToRoom({
    type: 'COLISEUM_PLAYER_STATES',
    payload: { states: pending.playerStates },
  });
}

export function handleColiseumAttack(
  ws: WebSocket,
  payload: { gameId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (state.phase !== 'COLISEUM_BATTLE') return;
  const pending = orch.getPendingColiseum();
  if (!pending) return;
  if (meta.userId !== pending.attackerId && meta.userId !== pending.defenderId) return;

  // Attack cooldown (server-side)
  const now = Date.now();
  if (now - (pending.attackCooldowns[meta.userId] ?? 0) < COLISEUM_ATTACK_COOLDOWN_MS) return;
  pending.attackCooldowns[meta.userId] = now;

  const opponentId = meta.userId === pending.attackerId ? pending.defenderId : pending.attackerId;
  const myState = pending.playerStates[meta.userId];
  const oppState = pending.playerStates[opponentId];
  if (!myState || !oppState) return;

  const dx = oppState.x - myState.x;
  const dz = oppState.z - myState.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > COLISEUM_ATTACK_RANGE) return; // miss (no message, client shows miss locally)

  // Attacker must be roughly facing opponent (120° arc)
  const angleToOpp = Math.atan2(dx, dz);
  if (Math.abs(normalizeAngle(angleToOpp - myState.rotation)) > Math.PI * 0.65) return;

  // Shield block: opponent blocks if their shield faces attacker (110° arc)
  let blocked = false;
  if (oppState.shielding) {
    const angleToMe = Math.atan2(-dx, -dz);
    if (Math.abs(normalizeAngle(angleToMe - oppState.rotation)) < Math.PI * 0.6) {
      blocked = true;
    }
  }

  const battle = state.coliseumBattle!;
  const isBoardAttacker = meta.userId === pending.attackerId;

  // Apply HP damage + check for round win
  let newAttackerHp = battle.attackerHp;
  let newDefenderHp = battle.defenderHp;
  let newAttackerScore = battle.attackerScore;
  let newDefenderScore = battle.defenderScore;
  let roundWon = false;

  if (!blocked) {
    if (isBoardAttacker) {
      newDefenderHp = Math.max(0, battle.defenderHp - COLISEUM_HIT_DAMAGE);
      if (newDefenderHp === 0) { newAttackerScore++; newDefenderHp = COLISEUM_MAX_HP; newAttackerHp = COLISEUM_MAX_HP; roundWon = true; }
    } else {
      newAttackerHp = Math.max(0, battle.attackerHp - COLISEUM_HIT_DAMAGE);
      if (newAttackerHp === 0) { newDefenderScore++; newAttackerHp = COLISEUM_MAX_HP; newDefenderHp = COLISEUM_MAX_HP; roundWon = true; }
    }
    orch.updateState(s => ({
      ...s,
      coliseumBattle: { ...s.coliseumBattle!, attackerScore: newAttackerScore, defenderScore: newDefenderScore, attackerHp: newAttackerHp, defenderHp: newDefenderHp },
    }));
  }

  ctx.broadcastToRoom({
    type: 'COLISEUM_HIT',
    payload: { attackerId: meta.userId, defenderId: opponentId, attackerScore: newAttackerScore, defenderScore: newDefenderScore, attackerHp: newAttackerHp, defenderHp: newDefenderHp, blocked },
  });

  if (!blocked && roundWon && (newAttackerScore >= COLISEUM_WIN_SCORE || newDefenderScore >= COLISEUM_WIN_SCORE)) {
    orch.clearPendingColiseum();
    applyColiseumResult(orch, ctx, pending, newAttackerScore, newDefenderScore, newAttackerScore >= COLISEUM_WIN_SCORE);
  }
}

function applyColiseumResult(
  orch: GameOrchestrator,
  ctx: ActionContext,
  pending: PendingColiseum,
  attackerScore: number,
  defenderScore: number,
  attackerWon: boolean,
): void {
  const state = orch.getState();
  const targetBuilding = state.buildings[pending.targetVertexId as any];
  const victim = state.players.find(p => p.id === pending.defenderId)!;

  // Restore turn timer: elapsed time before battle began continues from now
  const battleDuration = Date.now() - pending.battleStartedAt;
  const preTurnStart = pending.preBattleTurnStartTime;
  const restoredTurnStartTime = preTurnStart !== null ? preTurnStart + battleDuration : null;

  const victimBuildingCount = Object.values(state.buildings).filter(b => b.playerId === pending.defenderId).length;
  const canDestroy = victimBuildingCount > 1;

  let effect: 'siege' | 'destruction_choice' | 'repelled';
  if (!attackerWon) {
    effect = 'repelled';
  } else if (!targetBuilding?.sieged) {
    effect = 'siege';
  } else if (canDestroy) {
    effect = 'destruction_choice';
  } else {
    effect = 'repelled';
  }

  ctx.broadcastToRoom({
    type: 'COLISEUM_BATTLE_OVER',
    payload: {
      winnerId: attackerWon ? pending.attackerId : pending.defenderId,
      winnerSide: attackerWon ? 'attacker' : 'defender',
      attackerScore,
      defenderScore,
      effect,
      attackerName: pending.attackerName,
      defenderName: pending.defenderName,
    },
  });

  if (!attackerWon) {
    // Repelled: attacker loses soldiers
    const lossCount = pending.attackSoldiers === 3 ? 1 : pending.attackSoldiers;
    if (lossCount > 0) {
      orch.updateState(s => {
        const newBuildings = { ...s.buildings };
        let toRemove = lossCount;
        for (const vid of Object.keys(newBuildings)) {
          if (toRemove <= 0) break;
          const b = newBuildings[vid] as any;
          if (b.playerId === pending.attackerId && (b.soldiers ?? 0) > 0) {
            const remove = Math.min(b.soldiers, toRemove);
            newBuildings[vid] = { ...b, soldiers: b.soldiers - remove };
            toRemove -= remove;
          }
        }
        return { ...s, buildings: newBuildings as any, phase: 'ACTION', coliseumBattle: null, turnStartTime: restoredTurnStartTime };
      });
    } else {
      orch.updateState(s => ({ ...s, phase: 'ACTION', coliseumBattle: null, turnStartTime: restoredTurnStartTime }));
    }
    orch.addLogEntry('log.attackRepelled', { attacker: pending.attackerName, defender: pending.defenderName }, pending.attackerId);
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  if (!targetBuilding) {
    orch.updateState(s => ({ ...s, phase: 'ACTION', coliseumBattle: null, turnStartTime: restoredTurnStartTime }));
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  if (!targetBuilding.sieged) {
    orch.updateState(s => ({
      ...s,
      phase: 'ACTION',
      coliseumBattle: null,
      turnStartTime: restoredTurnStartTime,
      buildings: { ...s.buildings, [pending.targetVertexId]: { ...targetBuilding, sieged: true, siegedBy: pending.attackerId, siegedAtTurn: s.turn } },
    }));
    orch.addLogEntry('log.siegeStarted', { attacker: pending.attackerName, defender: pending.defenderName }, pending.attackerId);
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
  } else if (!canDestroy) {
    const lossCount2 = pending.attackSoldiers === 3 ? 1 : pending.attackSoldiers;
    if (lossCount2 > 0) {
      orch.updateState(s => {
        const newBuildings = { ...s.buildings };
        let toRemove = lossCount2;
        for (const vid of Object.keys(newBuildings)) {
          if (toRemove <= 0) break;
          const b = newBuildings[vid] as any;
          if (b.playerId === pending.attackerId && (b.soldiers ?? 0) > 0) {
            const remove = Math.min(b.soldiers, toRemove);
            newBuildings[vid] = { ...b, soldiers: b.soldiers - remove };
            toRemove -= remove;
          }
        }
        return { ...s, buildings: newBuildings as any, phase: 'ACTION', coliseumBattle: null, turnStartTime: restoredTurnStartTime };
      });
    } else {
      orch.updateState(s => ({ ...s, phase: 'ACTION', coliseumBattle: null, turnStartTime: restoredTurnStartTime }));
    }
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
  } else {
    orch.updateState(s => ({
      ...s,
      phase: 'WAR_DESTRUCTION',
      coliseumBattle: null,
      turnStartTime: restoredTurnStartTime,
      pendingDestruction: { targetVertex: pending.targetVertexId, attackerId: pending.attackerId },
    }));
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
  }
}

export function handleReconstruct(
  ws: WebSocket,
  payload: { gameId: string; vertexId: VertexId },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  if (!state.warMode || !state.warVariants?.reconstruction) { err(ctx, ws, 'NOT_ENABLED', 'Reconstruction is not enabled'); return; }
  if (state.phase !== 'ACTION') { err(ctx, ws, 'WRONG_PHASE', 'Can only reconstruct in ACTION phase'); return; }

  const destroyedVertices = state.destroyedVertices ?? {};
  if (destroyedVertices[payload.vertexId] !== meta.userId) {
    err(ctx, ws, 'NOT_YOUR_RUINS', 'That location was not your destroyed settlement'); return;
  }
  if (state.buildings[payload.vertexId]) { err(ctx, ws, 'OCCUPIED', 'That location is already occupied'); return; }

  const me = state.players.find(p => p.id === meta.userId)!;
  if (!hasResources(me.resources, WAR_RECONSTRUCT_COST)) {
    err(ctx, ws, 'INSUFFICIENT_RESOURCES', 'Need 2 timber and 2 clay to reconstruct'); return;
  }
  if (me.settlementsLeft <= 0) { err(ctx, ws, 'NO_SETTLEMENTS', 'No settlement pieces left'); return; }

  orch.updateState(s => {
    const newDestroyed = { ...(s.destroyedVertices ?? {}) };
    delete newDestroyed[payload.vertexId];
    return {
      ...s,
      players: s.players.map(p => p.id === meta.userId
        ? {
            ...p,
            resources: subtractResources(p.resources, WAR_RECONSTRUCT_COST),
            settlementsLeft: p.settlementsLeft - 1,
            victoryPoints: p.victoryPoints + 1,
          }
        : p),
      buildings: {
        ...s.buildings,
        [payload.vertexId]: { type: 'settlement', playerId: meta.userId },
      },
      destroyedVertices: newDestroyed,
    };
  });

  orch.addLogEntry('log.reconstructed', { player: meta.username }, meta.userId);
  if (checkAndHandleWin(orch, ctx)) {
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
