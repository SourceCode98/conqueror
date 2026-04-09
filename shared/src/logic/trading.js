"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPortRatios = getPortRatios;
exports.canBankTrade = canBankTrade;
const resources_js_1 = require("../types/resources.js");
const resources_js_2 = require("./resources.js");
function ok() { return { valid: true }; }
function fail(reason) { return { valid: false, reason }; }
/**
 * Returns the best trade ratio available for each resource for a given player.
 * Checks port vertices where the player has a settlement or city.
 */
function getPortRatios(state, playerId) {
    const ratios = {
        timber: 4, clay: 4, iron: 4, grain: 4, wool: 4,
    };
    for (const port of state.board.ports) {
        const hasAccess = port.vertices.some(vid => {
            const building = state.buildings[vid];
            return building?.playerId === playerId;
        });
        if (!hasAccess)
            continue;
        if (port.resource === null) {
            // Generic 3:1 port
            for (const r of resources_js_1.ALL_RESOURCES) {
                if (ratios[r] > 3)
                    ratios[r] = 3;
            }
        }
        else {
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
function canBankTrade(state, playerId, give, want) {
    const player = state.players.find(p => p.id === playerId);
    if (!player)
        return fail('Player not found');
    const ratios = getPortRatios(state, playerId);
    // Exactly one resource type being given
    const giveTypes = resources_js_1.ALL_RESOURCES.filter(r => give[r] > 0);
    if (giveTypes.length !== 1)
        return fail('Must give exactly one resource type');
    const giveType = giveTypes[0];
    const giveAmount = give[giveType];
    // Exactly one resource type being wanted
    const wantTypes = resources_js_1.ALL_RESOURCES.filter(r => want[r] > 0);
    if (wantTypes.length !== 1)
        return fail('Must want exactly one resource type');
    const wantType = wantTypes[0];
    if (want[wantType] !== 1)
        return fail('Can only receive 1 resource at a time');
    if (giveType === wantType)
        return fail('Cannot trade a resource for itself');
    const ratio = ratios[giveType];
    if (giveAmount !== ratio)
        return fail(`Must give exactly ${ratio} ${giveType}`);
    if (!(0, resources_js_2.hasResources)(player.resources, give))
        return fail('Insufficient resources');
    return ok();
}
//# sourceMappingURL=trading.js.map