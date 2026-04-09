import type { ResourceBundle, ResourceType } from '../types/resources.js';
import type { GameState } from '../types/gameState.js';
import { hexVertexIds } from './board.js';
import { EMPTY_RESOURCES, ALL_RESOURCES } from '../types/resources.js';

export function addResources(a: ResourceBundle, b: ResourceBundle): ResourceBundle {
  return {
    timber: a.timber + b.timber,
    clay:   a.clay + b.clay,
    iron:   a.iron + b.iron,
    grain:  a.grain + b.grain,
    wool:   a.wool + b.wool,
  };
}

export function subtractResources(a: ResourceBundle, b: ResourceBundle): ResourceBundle {
  return {
    timber: a.timber - b.timber,
    clay:   a.clay - b.clay,
    iron:   a.iron - b.iron,
    grain:  a.grain - b.grain,
    wool:   a.wool - b.wool,
  };
}

export function hasResources(hand: ResourceBundle, cost: ResourceBundle): boolean {
  return ALL_RESOURCES.every(r => hand[r] >= cost[r]);
}

export function totalResources(hand: ResourceBundle): number {
  return ALL_RESOURCES.reduce((sum, r) => sum + hand[r], 0);
}

/**
 * Given a dice roll number, collect resources for all players.
 * Returns a map of playerId → resources gained.
 * Skips hexes where the bandit is located.
 */
export function collectResources(
  state: GameState,
  roll: number
): Record<string, ResourceBundle> {
  const gains: Record<string, ResourceBundle> = {};
  for (const player of state.players) {
    gains[player.id] = { ...EMPTY_RESOURCES };
  }

  for (const tile of state.board.tiles) {
    if (tile.numberToken !== roll) continue;
    if (state.banditLocation.q === tile.coord.q && state.banditLocation.r === tile.coord.r) continue;
    if (tile.terrain === 'desert') continue;

    const resource = tile.terrain as ResourceType;

    // Find all buildings on this hex's vertices
    const vertexIds = hexVertexIds(tile.coord);
    for (const vid of vertexIds) {
      const building = state.buildings[vid];
      if (!building) continue;
      const amount = building.type === 'city' ? 2 : 1;
      gains[building.playerId][resource] += amount;
    }
  }

  return gains;
}
