import type { GameState } from '../types/gameState.js';
import type { ResourceBundle, ResourceType } from '../types/resources.js';
import { ALL_RESOURCES, EMPTY_RESOURCES } from '../types/resources.js';
import { hasResources, totalResources } from './resources.js';
import type { ValidationResult } from './buildings.js';

function ok(): ValidationResult { return { valid: true }; }
function fail(reason: string): ValidationResult { return { valid: false, reason }; }

/**
 * Returns the best trade ratio available for each resource for a given player.
 * Checks port vertices where the player has a settlement or city.
 */
export function getPortRatios(
  state: GameState,
  playerId: string,
): Record<ResourceType, 2 | 3 | 4> {
  const ratios: Record<ResourceType, 2 | 3 | 4> = {
    timber: 4, clay: 4, iron: 4, grain: 4, wool: 4,
  };

  for (const port of state.board.ports) {
    const hasAccess = port.vertices.some(vid => {
      const building = state.buildings[vid];
      return building?.playerId === playerId;
    });
    if (!hasAccess) continue;

    if (port.resource === null) {
      // Generic 3:1 port
      for (const r of ALL_RESOURCES) {
        if (ratios[r] > 3) ratios[r] = 3;
      }
    } else {
      // Specific 2:1 port
      ratios[port.resource] = 2;
    }
  }

  return ratios;
}

/**
 * Validate a bank/port trade.
 * The give bundle must be exactly one resource type at the correct ratio.
 * The want bundle must be exactly one resource type at amount 1.
 */
export function canBankTrade(
  state: GameState,
  playerId: string,
  give: ResourceBundle,
  want: ResourceBundle,
): ValidationResult {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return fail('Player not found');

  const ratios = getPortRatios(state, playerId);

  // Exactly one resource type being given
  const giveTypes = ALL_RESOURCES.filter(r => give[r] > 0);
  if (giveTypes.length !== 1) return fail('Must give exactly one resource type');
  const giveType = giveTypes[0];
  const giveAmount = give[giveType];

  // Exactly one resource type being wanted
  const wantTypes = ALL_RESOURCES.filter(r => want[r] > 0);
  if (wantTypes.length !== 1) return fail('Must want exactly one resource type');
  const wantType = wantTypes[0];
  if (want[wantType] !== 1) return fail('Can only receive 1 resource at a time');

  if (giveType === wantType) return fail('Cannot trade a resource for itself');

  const ratio = ratios[giveType];
  if (giveAmount !== ratio) return fail(`Must give exactly ${ratio} ${giveType}`);

  if (!hasResources(player.resources, give)) return fail('Insufficient resources');

  return ok();
}
