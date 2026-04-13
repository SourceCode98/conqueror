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

// Large 4-5-6-7-6-5-4 hex layout (radius 3, 37 tiles) for 5-6 players
export const LARGE_HEX_COORDS: AxialCoord[] = [
  // row 0 — 4 hexes
  { q: 0, r: -3 }, { q: 1, r: -3 }, { q: 2, r: -3 }, { q: 3, r: -3 },
  // row 1 — 5 hexes
  { q: -1, r: -2 }, { q: 0, r: -2 }, { q: 1, r: -2 }, { q: 2, r: -2 }, { q: 3, r: -2 },
  // row 2 — 6 hexes
  { q: -2, r: -1 }, { q: -1, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 2, r: -1 }, { q: 3, r: -1 },
  // row 3 — 7 hexes (middle)
  { q: -3, r: 0 }, { q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 },
  // row 4 — 6 hexes
  { q: -3, r: 1 }, { q: -2, r: 1 }, { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 1 },
  // row 5 — 5 hexes
  { q: -3, r: 2 }, { q: -2, r: 2 }, { q: -1, r: 2 }, { q: 0, r: 2 }, { q: 1, r: 2 },
  // row 6 — 4 hexes
  { q: -3, r: 3 }, { q: -2, r: 3 }, { q: -1, r: 3 }, { q: 0, r: 3 },
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

// Large board resource distribution: 7×5 resources + 2 deserts = 37 tiles
export const LARGE_TERRAIN_DISTRIBUTION: TerrainType[] = [
  'timber', 'timber', 'timber', 'timber', 'timber', 'timber', 'timber',
  'clay', 'clay', 'clay', 'clay', 'clay', 'clay', 'clay',
  'iron', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron',
  'grain', 'grain', 'grain', 'grain', 'grain', 'grain', 'grain',
  'wool', 'wool', 'wool', 'wool', 'wool', 'wool', 'wool',
  'desert', 'desert',
];

// Standard number tokens (18 for 18 resource hexes, desert gets none)
export const NUMBER_TOKENS: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

// Large board number tokens (35 for 35 resource hexes)
export const LARGE_NUMBER_TOKENS: number[] = [
  2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6,
  8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 12, 12,
];

// Large board port positions (11 ports distributed around radius-3 boundary)
// Each entry: the boundary hex coord + the edge direction facing the ocean
export const LARGE_PORT_POSITIONS: Array<{ coord: AxialCoord; dir: 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW' }> = [
  { coord: { q: 0, r: -3 }, dir: 'NW' },   // top boundary, left
  { coord: { q: 2, r: -3 }, dir: 'NE' },   // top boundary, right
  { coord: { q: 3, r: -3 }, dir: 'NE' },   // top-right corner
  { coord: { q: 3, r: -1 }, dir: 'E' },    // right side
  { coord: { q: 2, r: 1 },  dir: 'SE' },   // lower-right diagonal
  { coord: { q: 0, r: 3 },  dir: 'SW' },   // bottom, right
  { coord: { q: -2, r: 3 }, dir: 'SW' },   // bottom, left
  { coord: { q: -3, r: 3 }, dir: 'W' },    // bottom-left corner
  { coord: { q: -3, r: 1 }, dir: 'W' },    // left side
  { coord: { q: -3, r: 0 }, dir: 'NW' },   // upper-left corner
  { coord: { q: -1, r: -2 }, dir: 'NW' },  // upper-left diagonal
];

export const LARGE_PORT_RESOURCES: Array<{ ratio: 2 | 3; resource: 'timber' | 'clay' | 'iron' | 'grain' | 'wool' | null }> = [
  { ratio: 2, resource: 'timber' },
  { ratio: 2, resource: 'clay' },
  { ratio: 2, resource: 'iron' },
  { ratio: 2, resource: 'grain' },
  { ratio: 2, resource: 'wool' },
  { ratio: 3, resource: null },
  { ratio: 3, resource: null },
  { ratio: 3, resource: null },
  { ratio: 3, resource: null },
  { ratio: 3, resource: null },
  { ratio: 3, resource: null },
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

// Extra cards added to deck when war mode is enabled
export const WAR_CARD_EXTRAS: DevCardType[] = [
  ...Array(3).fill('troopSupply'),  // 2 free soldiers
  ...Array(2).fill('marchOrders'),  // +1 transfer distance this turn
];

export const VICTORY_POINTS_TO_WIN = 10;
export const GRAND_ROAD_MIN_LENGTH = 5;
export const SUPREME_ARMY_MIN_KNIGHTS = 3;

/** Selectable player colors (hex). Add more here to expand the palette. */
export const PLAYER_COLOR_OPTIONS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f97316', // orange
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#eab308', // yellow
] as const;

/** Legacy named colors accepted for backward compatibility */
const LEGACY_COLORS = ['red', 'blue', 'green', 'orange'];

export const PLAYER_COLORS = ['red', 'blue', 'green', 'orange'] as const;
export const IS_VALID_PLAYER_COLOR = (c: string) =>
  LEGACY_COLORS.includes(c) || (PLAYER_COLOR_OPTIONS as readonly string[]).includes(c);

// Starting pieces per player
export const STARTING_SETTLEMENTS = 5;
export const STARTING_CITIES = 4;
export const STARTING_ROADS = 15;

// ── War mode constants ────────────────────────────────────────────────────────
export const SOLDIER_COST: Record<ResourceType, number> = { timber: 0, clay: 0, iron: 1, grain: 1, wool: 1 };
export const MAX_SOLDIERS_SETTLEMENT = 2;
export const MAX_SOLDIERS_CITY = 3;
export const WARLORD_POINTS = 2;
export const WAR_RECONSTRUCT_COST: Record<ResourceType, number> = { timber: 2, clay: 2, iron: 0, grain: 0, wool: 0 };
