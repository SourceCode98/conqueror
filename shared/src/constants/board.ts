import type { AxialCoord } from '../types/board.js';
import type { TerrainType, ResourceType } from '../types/resources.js';
import type { DevCardType } from '../types/gameState.js';

// Standard 3-4-5-4-3 hex layout in axial coordinates (pointy-top)
export const STANDARD_HEX_COORDS: AxialCoord[] = [
  // row 0 — 3 hexes
  { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 },
  // row 1 — 4 hexes
  { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 },
  // row 2 — 5 hexes (middle)
  { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
  // row 3 — 4 hexes
  { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 },
  // row 4 — 3 hexes
  { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 },
];

// Resource distribution: 4+3+3+4+4+1 = 19 tiles
export const TERRAIN_DISTRIBUTION: TerrainType[] = [
  'timber', 'timber', 'timber', 'timber',
  'clay', 'clay', 'clay',
  'iron', 'iron', 'iron',
  'grain', 'grain', 'grain', 'grain',
  'wool', 'wool', 'wool', 'wool',
  'desert',
];

// Standard number tokens (18 for 18 resource hexes, desert gets none)
export const NUMBER_TOKENS: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

// Build costs
export const BUILD_COSTS: Record<string, Record<ResourceType, number>> = {
  road:       { timber: 1, clay: 1, iron: 0, grain: 0, wool: 0 },
  settlement: { timber: 1, clay: 1, iron: 0, grain: 1, wool: 1 },
  city:       { timber: 0, clay: 0, iron: 3, grain: 2, wool: 0 },
  devCard:    { timber: 0, clay: 0, iron: 1, grain: 1, wool: 1 },
};

// Dev card deck composition (25 total)
export const DEV_CARD_DECK: DevCardType[] = [
  ...Array(14).fill('warrior'),
  ...Array(5).fill('victoryPoint'),
  ...Array(2).fill('roadBuilding'),
  ...Array(2).fill('yearOfPlenty'),
  ...Array(2).fill('monopoly'),
];

export const VICTORY_POINTS_TO_WIN = 10;
export const GRAND_ROAD_MIN_LENGTH = 5;
export const SUPREME_ARMY_MIN_KNIGHTS = 3;

/** Legacy named colors kept for backward-compat; server now accepts any #rrggbb hex */
export const PLAYER_COLORS = ['red', 'blue', 'green', 'orange'] as const;
export const IS_VALID_PLAYER_COLOR = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

// Starting pieces per player
export const STARTING_SETTLEMENTS = 5;
export const STARTING_CITIES = 4;
export const STARTING_ROADS = 15;
