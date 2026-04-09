import type { GameState } from '../types/gameState.js';
import type { ResourceBundle, ResourceType } from '../types/resources.js';
import type { ValidationResult } from './buildings.js';
/**
 * Returns the best trade ratio available for each resource for a given player.
 * Checks port vertices where the player has a settlement or city.
 */
export declare function getPortRatios(state: GameState, playerId: string): Record<ResourceType, 2 | 3 | 4>;
/**
 * Validate a bank/port trade.
 * The give bundle must be exactly one resource type at the correct ratio.
 * The want bundle must be exactly one resource type at amount 1.
 */
export declare function canBankTrade(state: GameState, playerId: string, give: ResourceBundle, want: ResourceBundle): ValidationResult;
//# sourceMappingURL=trading.d.ts.map