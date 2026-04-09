import type { AxialCoord } from '../types/board.js';
import type { TerrainType, ResourceType } from '../types/resources.js';
import type { DevCardType } from '../types/gameState.js';
export declare const STANDARD_HEX_COORDS: AxialCoord[];
export declare const TERRAIN_DISTRIBUTION: TerrainType[];
export declare const NUMBER_TOKENS: number[];
export declare const BUILD_COSTS: Record<string, Record<ResourceType, number>>;
export declare const DEV_CARD_DECK: DevCardType[];
export declare const VICTORY_POINTS_TO_WIN = 10;
export declare const GRAND_ROAD_MIN_LENGTH = 5;
export declare const SUPREME_ARMY_MIN_KNIGHTS = 3;
export declare const PLAYER_COLORS: readonly ["red", "blue", "green", "orange"];
export declare const STARTING_SETTLEMENTS = 5;
export declare const STARTING_CITIES = 4;
export declare const STARTING_ROADS = 15;
//# sourceMappingURL=board.d.ts.map