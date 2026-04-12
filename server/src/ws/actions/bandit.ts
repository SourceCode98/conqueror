import { WebSocket } from 'ws';
import type { AxialCoord } from '@conqueror/shared';
import { axialEquals, hexVertexIds, recalculateSpecialCards } from '@conqueror/shared';
import { checkAndHandleWin } from './winCheck.js';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';

export function handleMoveBandit(
  ws: WebSocket,
  payload: { gameId: string; coord: AxialCoord; stealFromPlayerId?: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'ROBBER') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not robber phase' } });
    return;
  }

  // Bandit must move to a different hex
  if (axialEquals(payload.coord, state.banditLocation)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'SAME_HEX', message: 'Bandit must move to a different hex' } });
    return;
  }

  // Coord must be a valid board tile
  const tile = state.board.tiles.find(t => axialEquals(t.coord, payload.coord));
  if (!tile) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_TILE', message: 'Invalid tile' } });
    return;
  }

  // If stealFromPlayerId specified, validate they have a building adjacent to this tile
  if (payload.stealFromPlayerId) {
    if (payload.stealFromPlayerId === meta.userId) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'CANNOT_STEAL_SELF', message: 'Cannot steal from yourself' } });
      return;
    }

    const tileVertices = hexVertexIds(payload.coord);
    const hasBuilding = tileVertices.some(vid => {
      const b = state.buildings[vid];
      return b?.playerId === payload.stealFromPlayerId;
    });

    if (!hasBuilding) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_BUILDING_ADJACENT', message: 'That player has no building adjacent to this tile' } });
      return;
    }
  }

  let banditBlocked = false;
  let banditBlockedVictim = '';

  orch.updateState(s => {
    // Execute steal
    let newPlayers = [...s.players];
    if (payload.stealFromPlayerId) {
      const victim = s.players.find(p => p.id === payload.stealFromPlayerId)!;
      const victimResources = Object.entries(victim.resources)
        .filter(([, v]) => (v as number) > 0)
        .flatMap(([k, v]) => Array(v as number).fill(k)) as string[];

      // War mode: check if victim has soldier protection at any adjacent building
      const victimHasSoldierProtection = s.warMode && hexVertexIds(payload.coord).some(vid => {
        const b = s.buildings[vid];
        return b?.playerId === payload.stealFromPlayerId && (b.soldiers ?? 0) >= 1;
      });

      if (victimResources.length > 0 && !victimHasSoldierProtection) {
        const stolen = victimResources[Math.floor(Math.random() * victimResources.length)];
        newPlayers = s.players.map(p => {
          if (p.id === payload.stealFromPlayerId) return { ...p, resources: { ...p.resources, [stolen]: (p.resources as any)[stolen] - 1 } };
          if (p.id === meta.userId) return { ...p, resources: { ...p.resources, [stolen]: (p.resources as any)[stolen] + 1 } };
          return p;
        });
      } else if (victimHasSoldierProtection) {
        banditBlocked = true;
        banditBlockedVictim = victim.username;
      }
    }

    const newBoard = {
      ...s.board,
      tiles: s.board.tiles.map(t => ({ ...t, hasBandit: axialEquals(t.coord, payload.coord) })),
    };

    // Recalculate supreme army if warrior was just played
    const updatedPlayers = recalculateSpecialCards({
      ...s,
      banditLocation: payload.coord,
      board: newBoard,
      players: newPlayers,
    });

    return {
      ...s,
      banditLocation: payload.coord,
      board: newBoard,
      phase: 'ACTION',
      players: updatedPlayers,
    };
  });

  checkAndHandleWin(orch, ctx);
  orch.addLogEntry('log.movedBandit', { player: meta.username }, meta.userId);
  if (banditBlocked) {
    orch.addLogEntry('log.banditBlocked', { attacker: meta.username, defender: banditBlockedVictim }, meta.userId);
  }
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
