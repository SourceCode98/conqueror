import type { GameState } from '../types/gameState.js';
import type { VertexId, EdgeId } from '../types/board.js';
export interface ValidationResult {
    valid: boolean;
    reason?: string;
}
/**
 * Can a player place a settlement at this vertex?
 * During setup phases: no road requirement.
 * During main phase: must have a connecting road.
 */
export declare function canPlaceSettlement(state: GameState, playerId: string, vertexId: VertexId): ValidationResult;
/**
 * Can a player upgrade a settlement to a city at this vertex?
 */
export declare function canPlaceCity(state: GameState, playerId: string, vertexId: VertexId): ValidationResult;
/**
 * Can a player place a road on this edge?
 * During setup: connects to the last placed settlement (no road-to-road required).
 * During main: must connect to existing road or building; cannot be blocked by opponent building at junction.
 */
export declare function canPlaceRoad(state: GameState, playerId: string, edgeId: EdgeId, setupVertexId?: VertexId): ValidationResult;
//# sourceMappingURL=buildings.d.ts.map