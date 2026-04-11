"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canPlaceSettlement = canPlaceSettlement;
exports.canPlaceCity = canPlaceCity;
exports.canPlaceRoad = canPlaceRoad;
const board_js_1 = require("./board.js");
const resources_js_1 = require("./resources.js");
const board_js_2 = require("../constants/board.js");
function ok() { return { valid: true }; }
function fail(reason) { return { valid: false, reason }; }
/**
 * Can a player place a settlement at this vertex?
 * During setup phases: no road requirement.
 * During main phase: must have a connecting road.
 */
function canPlaceSettlement(state, playerId, vertexId) {
    // Must be a valid board vertex
    if (!state.board.vertices.includes(vertexId))
        return fail('Invalid vertex');
    // No building already there
    if (state.buildings[vertexId])
        return fail('Vertex already occupied');
    // Distance rule: no adjacent vertices may have a building
    const boardVertexSet = new Set(state.board.vertices);
    const adj = (0, board_js_1.adjacentVertices)(vertexId, boardVertexSet);
    if (adj.some(v => state.buildings[v]))
        return fail('Too close to another building');
    const isSetupPhase = state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE';
    if (!isSetupPhase) {
        // Must afford it
        const player = state.players.find(p => p.id === playerId);
        if (!player)
            return fail('Player not found');
        if (!(0, resources_js_1.hasResources)(player.resources, board_js_2.BUILD_COSTS.settlement))
            return fail('Insufficient resources');
        // Must have remaining pieces
        if (player.settlementsLeft <= 0)
            return fail('No settlements remaining');
        // Must have a connecting road
        const hasRoad = state.board.edges.some(eid => {
            const [v1, v2] = (0, board_js_1.edgeVertices)(eid);
            if (v1 !== vertexId && v2 !== vertexId)
                return false;
            return state.roads[eid]?.playerId === playerId;
        });
        if (!hasRoad)
            return fail('No connecting road');
    }
    else {
        const player = state.players.find(p => p.id === playerId);
        if (!player)
            return fail('Player not found');
        if (player.settlementsLeft <= 0)
            return fail('No settlements remaining');
    }
    return ok();
}
/**
 * Can a player upgrade a settlement to a city at this vertex?
 */
function canPlaceCity(state, playerId, vertexId) {
    const building = state.buildings[vertexId];
    if (!building)
        return fail('No settlement at this vertex');
    if (building.playerId !== playerId)
        return fail('Not your settlement');
    if (building.type !== 'settlement')
        return fail('Already a city');
    const player = state.players.find(p => p.id === playerId);
    if (!player)
        return fail('Player not found');
    if (!(0, resources_js_1.hasResources)(player.resources, board_js_2.BUILD_COSTS.city))
        return fail('Insufficient resources');
    if (player.citiesLeft <= 0)
        return fail('No cities remaining');
    return ok();
}
/**
 * Can a player place a road on this edge?
 * During setup: connects to the last placed settlement (no road-to-road required).
 * During main: must connect to existing road or building; cannot be blocked by opponent building at junction.
 */
function canPlaceRoad(state, playerId, edgeId, setupVertexId, free) {
    if (!state.board.edges.includes(edgeId))
        return fail('Invalid edge');
    if (state.roads[edgeId])
        return fail('Edge already has a road');
    const player = state.players.find(p => p.id === playerId);
    if (!player)
        return fail('Player not found');
    if (player.roadsLeft <= 0)
        return fail('No roads remaining');
    const isSetupPhase = state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE';
    if (isSetupPhase && setupVertexId) {
        // During setup, road must connect to the settlement just placed
        const [v1, v2] = (0, board_js_1.edgeVertices)(edgeId);
        if (v1 !== setupVertexId && v2 !== setupVertexId)
            return fail('Road must connect to your settlement');
        return ok();
    }
    // Must afford it (unless free, e.g. Road Building card)
    if (!free && !(0, resources_js_1.hasResources)(player.resources, board_js_2.BUILD_COSTS.road))
        return fail('Insufficient resources');
    // Must connect to player's existing road or building without being blocked by opponent
    const [v1, v2] = (0, board_js_1.edgeVertices)(edgeId);
    const connectsToV1 = canRoadConnectAtVertex(state, playerId, edgeId, v1);
    const connectsToV2 = canRoadConnectAtVertex(state, playerId, edgeId, v2);
    if (!connectsToV1 && !connectsToV2)
        return fail('No valid connection point');
    return ok();
}
function canRoadConnectAtVertex(state, playerId, edgeId, vertexId) {
    // If there's an opponent's building here, the road cannot pass through
    const building = state.buildings[vertexId];
    if (building && building.playerId !== playerId)
        return false;
    // Check if there's a player building here (settlement/city)
    if (building && building.playerId === playerId)
        return true;
    // Check if there's a player road connected at this vertex
    return state.board.edges.some(eid => {
        if (eid === edgeId)
            return false;
        const [v1, v2] = (0, board_js_1.edgeVertices)(eid);
        if (v1 !== vertexId && v2 !== vertexId)
            return false;
        return state.roads[eid]?.playerId === playerId;
    });
}
//# sourceMappingURL=buildings.js.map