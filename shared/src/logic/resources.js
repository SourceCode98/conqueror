"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addResources = addResources;
exports.subtractResources = subtractResources;
exports.hasResources = hasResources;
exports.totalResources = totalResources;
exports.collectResources = collectResources;
const board_js_1 = require("./board.js");
const resources_js_1 = require("../types/resources.js");
function addResources(a, b) {
    return {
        timber: a.timber + b.timber,
        clay: a.clay + b.clay,
        iron: a.iron + b.iron,
        grain: a.grain + b.grain,
        wool: a.wool + b.wool,
    };
}
function subtractResources(a, b) {
    return {
        timber: a.timber - b.timber,
        clay: a.clay - b.clay,
        iron: a.iron - b.iron,
        grain: a.grain - b.grain,
        wool: a.wool - b.wool,
    };
}
function hasResources(hand, cost) {
    return resources_js_1.ALL_RESOURCES.every(r => hand[r] >= cost[r]);
}
function totalResources(hand) {
    return resources_js_1.ALL_RESOURCES.reduce((sum, r) => sum + hand[r], 0);
}
/**
 * Given a dice roll number, collect resources for all players.
 * Returns a map of playerId → resources gained.
 * Skips hexes where the bandit is located.
 */
function collectResources(state, roll) {
    const gains = {};
    for (const player of state.players) {
        gains[player.id] = { ...resources_js_1.EMPTY_RESOURCES };
    }
    for (const tile of state.board.tiles) {
        if (tile.numberToken !== roll)
            continue;
        if (state.banditLocation.q === tile.coord.q && state.banditLocation.r === tile.coord.r)
            continue;
        if (tile.terrain === 'desert')
            continue;
        const resource = tile.terrain;
        // Find all buildings on this hex's vertices
        const vertexIds = (0, board_js_1.hexVertexIds)(tile.coord);
        for (const vid of vertexIds) {
            const building = state.buildings[vid];
            if (!building)
                continue;
            const amount = building.type === 'city' ? 2 : 1;
            gains[building.playerId][resource] += amount;
        }
    }
    return gains;
}
//# sourceMappingURL=resources.js.map