import type { GameState, Building } from '../types/gameState.js';
import type { VertexId, EdgeId } from '../types/board.js';
import { edgeVertices } from './board.js';
import { WARLORD_POINTS } from '../constants/board.js';

export function roadDistanceToVertex(
  state: GameState,
  attackerId: string,
  targetVertexId: string,
): number {
  const dist = new Map<string, number>();
  const queue: Array<[string, number]> = [];

  for (const [vid, building] of Object.entries(state.buildings)) {
    if (building.playerId === attackerId && !dist.has(vid)) {
      dist.set(vid, 0);
      queue.push([vid, 0]);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const [vertex, d] = queue[head++];
    if (vertex === targetVertexId) return d;
    if (d >= 2) continue;

    for (const [edgeId, road] of Object.entries(state.roads)) {
      if (!road.playerId) continue; // skip empty edges
      const [v1, v2] = edgeVertices(edgeId as EdgeId);
      const neighbor = v1 === vertex ? v2 : v2 === vertex ? v1 : null;
      if (!neighbor || dist.has(neighbor)) continue;
      dist.set(neighbor, d + 1);
      queue.push([neighbor, d + 1]);
    }
  }

  return Infinity;
}

export function countPlayerSoldiers(buildings: Record<string, Building>, playerId: string): number {
  let total = 0;
  for (const b of Object.values(buildings)) {
    if (b.playerId === playerId) total += b.soldiers ?? 0;
  }
  return total;
}

export function updateWarlord(state: GameState): GameState {
  if (!state.warMode) return state;
  const destroyed = state.destroyedByPlayer ?? {};

  const qualifies = (pid: string) => {
    const d = destroyed[pid] ?? { settlements: 0, cities: 0 };
    return d.settlements >= 2 || d.cities >= 1;
  };
  const score = (pid: string) => {
    const d = destroyed[pid] ?? { settlements: 0, cities: 0 };
    return d.settlements + d.cities * 2;
  };

  let bestId: string | null = null;
  let bestScore = -1;
  for (const p of state.players) {
    if (qualifies(p.id) && score(p.id) > bestScore) {
      bestScore = score(p.id);
      bestId = p.id;
    }
  }

  if (bestId === state.warlordPlayerId) return state;

  let players = state.players;
  if (state.warlordPlayerId) {
    players = players.map(p =>
      p.id === state.warlordPlayerId
        ? { ...p, victoryPoints: p.victoryPoints - WARLORD_POINTS, hasWarlord: false }
        : p,
    );
  }
  if (bestId) {
    players = players.map(p =>
      p.id === bestId
        ? { ...p, victoryPoints: p.victoryPoints + WARLORD_POINTS, hasWarlord: true }
        : p,
    );
  }
  return { ...state, warlordPlayerId: bestId, players };
}

export interface WarTurnOrchestrator {
  getState(): GameState;
  updateState(fn: (s: GameState) => GameState): void;
}

export function liftPlayerSieges(orch: WarTurnOrchestrator, pid: string): void {
  const state = orch.getState();
  if (!state.warMode) return;
  // Only lift sieges placed on a PREVIOUS turn (not the current one).
  // This allows the attacker one full extra turn to re-attack the sieged building.
  const currentTurn = state.turn;
  const toExpire = Object.values(state.buildings).filter(
    b => b.sieged && b.siegedBy === pid && (b.siegedAtTurn ?? 0) < currentTurn,
  );
  if (toExpire.length === 0) return;

  const player = state.players.find(p => p.id === pid);
  const playerName = player?.username ?? pid;
  orch.updateState(s => {
    const newBuildings: Record<string, Building> = {};
    for (const [vid, b] of Object.entries(s.buildings)) {
      newBuildings[vid] = (b.sieged && b.siegedBy === pid && (b.siegedAtTurn ?? 0) < currentTurn)
        ? { ...b, sieged: false, siegedBy: null, siegedAtTurn: undefined }
        : b;
    }
    return {
      ...s,
      buildings: newBuildings as any,
      log: [...s.log, { timestamp: Date.now(), playerId: pid, messageKey: 'log.siegeExpired', params: { player: playerName } }],
    };
  });
}

export function applyWarTurnStart(orch: WarTurnOrchestrator): void {
  const state = orch.getState();
  if (!state.warMode) return;

  const pid = state.activePlayerId;

  orch.updateState(s => {
    const player = s.players.find(p => p.id === pid)!;
    const playerName = player?.username ?? pid;
    const newLog = [...s.log];
    const newBuildings: Record<string, Building> = { ...s.buildings };

    // Soldier maintenance: every 2 soldiers costs 1 grain
    const totalSoldiers = countPlayerSoldiers(newBuildings, pid);
    const grainCost = Math.floor(totalSoldiers / 2);
    let players = s.players;

    if (grainCost > 0) {
      if (player.resources.grain >= grainCost) {
        players = players.map(p =>
          p.id === pid
            ? { ...p, resources: { ...p.resources, grain: p.resources.grain - grainCost } }
            : p,
        );
        newLog.push({ timestamp: Date.now(), playerId: pid, messageKey: 'log.soldierMaintenance', params: { player: playerName, grain: grainCost } });
      } else {
        // Can't pay — lose half soldiers (rounded down)
        const keep = Math.floor(totalSoldiers / 2);
        const lost = totalSoldiers - keep;
        let toRemove = lost;
        for (const vid of Object.keys(newBuildings)) {
          if (toRemove <= 0) break;
          const b = newBuildings[vid];
          if (b.playerId === pid && (b.soldiers ?? 0) > 0) {
            const remove = Math.min(b.soldiers!, toRemove);
            newBuildings[vid] = { ...b, soldiers: b.soldiers! - remove };
            toRemove -= remove;
          }
        }
        newLog.push({ timestamp: Date.now(), playerId: pid, messageKey: 'log.soldierDesertion', params: { player: playerName, lost } });
      }
    }

    return {
      ...s,
      buildings: newBuildings as any,
      players,
      log: newLog,
      attackUsedThisTurn: false,
    };
  });
}
