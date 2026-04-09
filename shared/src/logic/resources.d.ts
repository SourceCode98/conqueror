import type { ResourceBundle } from '../types/resources.js';
import type { GameState } from '../types/gameState.js';
export declare function addResources(a: ResourceBundle, b: ResourceBundle): ResourceBundle;
export declare function subtractResources(a: ResourceBundle, b: ResourceBundle): ResourceBundle;
export declare function hasResources(hand: ResourceBundle, cost: ResourceBundle): boolean;
export declare function totalResources(hand: ResourceBundle): number;
/**
 * Given a dice roll number, collect resources for all players.
 * Returns a map of playerId → resources gained.
 * Skips hexes where the bandit is located.
 */
export declare function collectResources(state: GameState, roll: number): Record<string, ResourceBundle>;
//# sourceMappingURL=resources.d.ts.map