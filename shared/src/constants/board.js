"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STARTING_ROADS = exports.STARTING_CITIES = exports.STARTING_SETTLEMENTS = exports.PLAYER_COLORS = exports.SUPREME_ARMY_MIN_KNIGHTS = exports.GRAND_ROAD_MIN_LENGTH = exports.VICTORY_POINTS_TO_WIN = exports.DEV_CARD_DECK = exports.BUILD_COSTS = exports.NUMBER_TOKENS = exports.TERRAIN_DISTRIBUTION = exports.STANDARD_HEX_COORDS = void 0;
// Standard 3-4-5-4-3 hex layout in axial coordinates (pointy-top)
exports.STANDARD_HEX_COORDS = [
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
exports.TERRAIN_DISTRIBUTION = [
    'timber', 'timber', 'timber', 'timber',
    'clay', 'clay', 'clay',
    'iron', 'iron', 'iron',
    'grain', 'grain', 'grain', 'grain',
    'wool', 'wool', 'wool', 'wool',
    'desert',
];
// Standard number tokens (18 for 18 resource hexes, desert gets none)
exports.NUMBER_TOKENS = [
    2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];
// Build costs
exports.BUILD_COSTS = {
    road: { timber: 1, clay: 1, iron: 0, grain: 0, wool: 0 },
    settlement: { timber: 1, clay: 1, iron: 0, grain: 1, wool: 1 },
    city: { timber: 0, clay: 0, iron: 3, grain: 2, wool: 0 },
    devCard: { timber: 0, clay: 0, iron: 1, grain: 1, wool: 1 },
};
// Dev card deck composition (25 total)
exports.DEV_CARD_DECK = [
    ...Array(14).fill('warrior'),
    ...Array(5).fill('victoryPoint'),
    ...Array(2).fill('roadBuilding'),
    ...Array(2).fill('yearOfPlenty'),
    ...Array(2).fill('monopoly'),
];
exports.VICTORY_POINTS_TO_WIN = 10;
exports.GRAND_ROAD_MIN_LENGTH = 5;
exports.SUPREME_ARMY_MIN_KNIGHTS = 3;
exports.PLAYER_COLORS = ['red', 'blue', 'green', 'orange'];
// Starting pieces per player
exports.STARTING_SETTLEMENTS = 5;
exports.STARTING_CITIES = 4;
exports.STARTING_ROADS = 15;
//# sourceMappingURL=board.js.map