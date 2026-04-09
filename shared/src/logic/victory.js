"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateLongestRoad = calculateLongestRoad;
exports.recalculateSpecialCards = recalculateSpecialCards;
exports.calculateTotalVP = calculateTotalVP;
exports.checkWinCondition = checkWinCondition;
const board_js_1 = require("./board.js");
const board_js_2 = require("../constants/board.js");
/**
 * Calculate the longest road for a player using DFS on the road graph.
 * Opponent buildings at junctions break the road.
 */
function calculateLongestRoad(state, playerId) {
    // Build adjacency: vertex → list of connected edges (for this player)
    const playerEdges = state.board.edges.filter(e => state.roads[e]?.playerId === playerId);
    if (playerEdges.length === 0)
        return 0;
    // DFS from every edge endpoint to find maximum path length
    let maxLength = 0;
    function dfs(currentVertex, visitedEdges) {
        let best = visitedEdges.size;
        for (const edgeId of playerEdges) {
            if (visitedEdges.has(edgeId))
                continue;
            const [v1, v2] = (0, board_js_1.edgeVertices)(edgeId);
            if (v1 !== currentVertex && v2 !== currentVertex)
                continue;
            const nextVertex = v1 === currentVertex ? v2 : v1;
            // Check if an opponent's building blocks this junction
            const nextBuilding = state.buildings[nextVertex];
            if (nextBuilding && nextBuilding.playerId !== playerId)
                continue;
            visitedEdges.add(edgeId);
            const length = dfs(nextVertex, visitedEdges);
            if (length > best)
                best = length;
            visitedEdges.delete(edgeId);
        }
        return best;
    }
    // Start DFS from every vertex that has a player road
    const startVertices = new Set();
    for (const edgeId of playerEdges) {
        const [v1, v2] = (0, board_js_1.edgeVertices)(edgeId);
        startVertices.add(v1);
        startVertices.add(v2);
    }
    for (const vertex of startVertices) {
        const len = dfs(vertex, new Set());
        if (len > maxLength)
            maxLength = len;
    }
    return maxLength;
}
/**
 * Recalculate Grand Road (longest road) and Supreme Army (largest army) holders.
 * Returns updated player states (does not mutate).
 */
function recalculateSpecialCards(state) {
    const players = state.players.map(p => ({ ...p }));
    // ─── Supreme Army ─────────────────────────────────────────────────────────
    let supremeArmyHolder = players.find(p => p.hasSupremeArmy);
    let maxKnights = supremeArmyHolder?.knightsPlayed ?? 0;
    for (const player of players) {
        if (player.knightsPlayed > maxKnights && player.knightsPlayed >= board_js_2.SUPREME_ARMY_MIN_KNIGHTS) {
            // Transfer Supreme Army
            if (supremeArmyHolder) {
                supremeArmyHolder.hasSupremeArmy = false;
                supremeArmyHolder.victoryPoints -= 2;
            }
            player.hasSupremeArmy = true;
            player.victoryPoints += 2;
            supremeArmyHolder = player;
            maxKnights = player.knightsPlayed;
        }
        else if (!supremeArmyHolder && player.knightsPlayed >= board_js_2.SUPREME_ARMY_MIN_KNIGHTS) {
            player.hasSupremeArmy = true;
            player.victoryPoints += 2;
            supremeArmyHolder = player;
            maxKnights = player.knightsPlayed;
        }
    }
    // ─── Grand Road ───────────────────────────────────────────────────────────
    const roadLengths = {};
    for (const player of players) {
        roadLengths[player.id] = calculateLongestRoad({ ...state, players }, player.id);
    }
    const currentHolder = players.find(p => p.hasGrandRoad);
    const currentHolderLen = currentHolder ? roadLengths[currentHolder.id] : 0;
    let newHolderId = currentHolder?.id ?? null;
    let maxLen = Math.max(currentHolderLen, board_js_2.GRAND_ROAD_MIN_LENGTH - 1);
    for (const player of players) {
        const len = roadLengths[player.id];
        if (len > maxLen) {
            maxLen = len;
            newHolderId = player.id;
        }
    }
    if (newHolderId !== currentHolder?.id) {
        if (currentHolder) {
            currentHolder.hasGrandRoad = false;
            currentHolder.victoryPoints -= 2;
        }
        const newHolder = players.find(p => p.id === newHolderId);
        if (newHolder) {
            newHolder.hasGrandRoad = true;
            newHolder.victoryPoints += 2;
        }
    }
    return players;
}
/**
 * Calculate the total VP for a player (including hidden VP cards).
 * Used server-side only.
 */
function calculateTotalVP(player) {
    return player.victoryPoints + player.victoryPointCards;
}
/**
 * Check if any player has reached the victory point threshold.
 * Returns the winning playerId or null.
 */
function checkWinCondition(state) {
    for (const player of state.players) {
        if (calculateTotalVP(player) >= board_js_2.VICTORY_POINTS_TO_WIN) {
            return player.id;
        }
    }
    return null;
}
//# sourceMappingURL=victory.js.map