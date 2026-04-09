import type { GameState, PlayerState } from '../types/gameState.js';
/**
 * Calculate the longest road for a player using DFS on the road graph.
 * Opponent buildings at junctions break the road.
 */
export declare function calculateLongestRoad(state: GameState, playerId: string): number;
/**
 * Recalculate Grand Road (longest road) and Supreme Army (largest army) holders.
 * Returns updated player states (does not mutate).
 */
export declare function recalculateSpecialCards(state: GameState): PlayerState[];
/**
 * Calculate the total VP for a player (including hidden VP cards).
 * Used server-side only.
 */
export declare function calculateTotalVP(player: PlayerState): number;
/**
 * Check if any player has reached the victory point threshold.
 * Returns the winning playerId or null.
 */
export declare function checkWinCondition(state: GameState): string | null;
//# sourceMappingURL=victory.d.ts.map