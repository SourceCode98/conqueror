"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIRECTION_NAMES = exports.HEX_DIRECTIONS = void 0;
exports.axialToCube = axialToCube;
exports.cubeToAxial = cubeToAxial;
exports.axialDistance = axialDistance;
exports.axialEquals = axialEquals;
exports.coordKey = coordKey;
exports.hexNeighbor = hexNeighbor;
exports.hexNeighbors = hexNeighbors;
exports.hexVertexIds = hexVertexIds;
exports.hexEdgeIds = hexEdgeIds;
exports.adjacentVertices = adjacentVertices;
exports.edgeVertices = edgeVertices;
exports.vertexEdgeIds = vertexEdgeIds;
exports.vertexTiles = vertexTiles;
exports.generateBoard = generateBoard;
exports.findDesertCoord = findDesertCoord;
const board_js_1 = require("../constants/board.js");
// ─── Coordinate Math ──────────────────────────────────────────────────────────
function axialToCube(coord) {
    return { x: coord.q, y: -coord.q - coord.r, z: coord.r };
}
function cubeToAxial(cube) {
    return { q: cube.x, r: cube.z };
}
function axialDistance(a, b) {
    const ca = axialToCube(a);
    const cb = axialToCube(b);
    return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
}
function axialEquals(a, b) {
    return a.q === b.q && a.r === b.r;
}
function coordKey(coord) {
    return `${coord.q}:${coord.r}`;
}
// ─── Neighbor Directions (pointy-top, axial) ──────────────────────────────────
// Directions in order: E, NE, NW, W, SW, SE
exports.HEX_DIRECTIONS = [
    { q: 1, r: 0 }, // 0: E
    { q: 1, r: -1 }, // 1: NE
    { q: 0, r: -1 }, // 2: NW
    { q: -1, r: 0 }, // 3: W
    { q: -1, r: 1 }, // 4: SW
    { q: 0, r: 1 }, // 5: SE
];
exports.DIRECTION_NAMES = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];
function hexNeighbor(coord, dirIndex) {
    const d = exports.HEX_DIRECTIONS[dirIndex];
    return { q: coord.q + d.q, r: coord.r + d.r };
}
function hexNeighbors(coord) {
    return exports.HEX_DIRECTIONS.map(d => ({ q: coord.q + d.q, r: coord.r + d.r }));
}
function canonicalVertex(hexes) {
    // Sort by r then q to find the minimum (topmost, then leftmost)
    const sorted = [...hexes].sort((a, b) => a.r !== b.r ? a.r - b.r : a.q - b.q);
    const min = sorted[0];
    // Is this the 'N' (top) or 'S' (bottom) corner of the minimum hex?
    // If the minimum hex is above the other two (lowest r), it's the S corner of min
    // If the minimum hex is in the middle or below, it's the N corner of min
    // Simple heuristic: if min.r < any other hex's r → it's the S corner of min (its bottom touches them)
    const hasHexBelow = hexes.some(h => h.r > min.r || (h.r === min.r && h.q > min.q));
    const pos = hasHexBelow ? 'S' : 'N';
    return `${min.q}:${min.r}:${pos}`;
}
// The 6 corners of hex H(q,r), each as a set of 3 sharing hexes:
function hexCornerHexSets(coord) {
    const { q, r } = coord;
    return [
        [{ q, r }, { q, r: r - 1 }, { q: q + 1, r: r - 1 }], // corner 0: top
        [{ q, r }, { q: q + 1, r: r - 1 }, { q: q + 1, r }], // corner 1: top-right
        [{ q, r }, { q: q + 1, r }, { q, r: r + 1 }], // corner 2: bot-right
        [{ q, r }, { q, r: r + 1 }, { q: q - 1, r: r + 1 }], // corner 3: bottom
        [{ q, r }, { q: q - 1, r: r + 1 }, { q: q - 1, r }], // corner 4: bot-left
        [{ q, r }, { q: q - 1, r }, { q, r: r - 1 }], // corner 5: top-left
    ];
}
function hexVertexIds(coord) {
    return hexCornerHexSets(coord).map(canonicalVertex);
}
const EDGE_DIR_INDEX = {
    NE: 1, E: 0, SE: 5, SW: 4, W: 3, NW: 2,
};
const OPPOSITE_DIR = {
    NE: 'SW', E: 'W', SE: 'NW', SW: 'NE', W: 'E', NW: 'SE',
};
const EDGE_DIRS = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];
function canonicalEdge(a, b, dirFromA) {
    // Pick the "smaller" hex as canonical (by r, then q)
    const aIsSmaller = a.r < b.r || (a.r === b.r && a.q < b.q);
    if (aIsSmaller) {
        return `${a.q}:${a.r}:${dirFromA}`;
    }
    else {
        return `${b.q}:${b.r}:${OPPOSITE_DIR[dirFromA]}`;
    }
}
function hexEdgeIds(coord) {
    return EDGE_DIRS.map((dir, i) => {
        const neighbor = hexNeighbor(coord, EDGE_DIR_INDEX[dir]);
        return canonicalEdge(coord, neighbor, dir);
    });
}
// ─── Adjacency ────────────────────────────────────────────────────────────────
/**
 * Returns the VertexIds of the 2-3 vertices adjacent to a given vertex.
 * Two vertices are adjacent if they share an edge.
 */
function adjacentVertices(vertexId, boardVertices) {
    // Parse the vertex ID to find the hex and position
    const parts = vertexId.split(':');
    const q = parseInt(parts[0]);
    const r = parseInt(parts[1]);
    const pos = parts[2];
    const coord = { q, r };
    // Find all 6 corners of this hex's neighbors and return those that share an edge with this vertex
    // A vertex V shares edges with exactly 3 other vertices. We find them by looking at
    // all vertices of all hexes that touch vertex V.
    const cornerSets = hexCornerHexSets(coord);
    const myCornerIndex = cornerSets.findIndex(set => canonicalVertex(set) === vertexId);
    if (myCornerIndex === -1) {
        // This vertex is not a corner of the given hex's canonical form — find it differently
        // by checking all board vertices
        return findAdjacentVerticesGeneral(vertexId, boardVertices);
    }
    // Adjacent corners are the previous and next corners on this hex (cyclically)
    const adj = [];
    const prev = hexCornerHexSets(coord)[(myCornerIndex + 5) % 6];
    const next = hexCornerHexSets(coord)[(myCornerIndex + 1) % 6];
    const prevId = canonicalVertex(prev);
    const nextId = canonicalVertex(next);
    if (boardVertices.has(prevId))
        adj.push(prevId);
    if (boardVertices.has(nextId))
        adj.push(nextId);
    // Also find the third adjacent vertex across the shared hex
    // Each vertex belongs to 3 hexes. For each neighboring hex, add its adjacent corners too.
    const sharingHexes = cornerSets[myCornerIndex];
    for (const hex of sharingHexes) {
        if (axialEquals(hex, coord))
            continue;
        const neighborCorners = hexCornerHexSets(hex);
        const idxInNeighbor = neighborCorners.findIndex(set => canonicalVertex(set) === vertexId);
        if (idxInNeighbor !== -1) {
            const p = canonicalVertex(neighborCorners[(idxInNeighbor + 5) % 6]);
            const n = canonicalVertex(neighborCorners[(idxInNeighbor + 1) % 6]);
            if (p !== vertexId && !adj.includes(p) && boardVertices.has(p))
                adj.push(p);
            if (n !== vertexId && !adj.includes(n) && boardVertices.has(n))
                adj.push(n);
        }
    }
    return adj;
}
function findAdjacentVerticesGeneral(vertexId, boardVertices) {
    // Fallback: look through all board vertices for edge connections
    const result = [];
    for (const vid of boardVertices) {
        if (vid === vertexId)
            continue;
        if (shareEdge(vertexId, vid))
            result.push(vid);
    }
    return result;
}
function shareEdge(v1, v2) {
    // Two vertices share an edge if they appear consecutively in any hex's corner list
    for (const coord of board_js_1.STANDARD_HEX_COORDS) {
        const corners = hexCornerHexSets(coord).map(canonicalVertex);
        for (let i = 0; i < 6; i++) {
            const a = corners[i];
            const b = corners[(i + 1) % 6];
            if ((a === v1 && b === v2) || (a === v2 && b === v1))
                return true;
        }
    }
    return false;
}
/**
 * Returns the two VertexIds at the ends of an edge.
 */
function edgeVertices(edgeId) {
    const parts = edgeId.split(':');
    const q = parseInt(parts[0]);
    const r = parseInt(parts[1]);
    const dir = parts[2];
    const coord = { q, r };
    const dirIdx = EDGE_DIR_INDEX[dir];
    const cornerSets = hexCornerHexSets(coord);
    // An edge between corners i and i+1 of this hex corresponds to edge direction:
    // Edge dirs map to corner pairs (for pointy-top):
    // NE (dir 1): corners 0-1 (top and top-right)
    // E  (dir 0): corners 1-2 (top-right and bot-right)
    // SE (dir 5): corners 2-3 (bot-right and bottom)
    // SW (dir 4): corners 3-4 (bottom and bot-left)
    // W  (dir 3): corners 4-5 (bot-left and top-left)
    // NW (dir 2): corners 5-0 (top-left and top)
    const edgeDirToCorners = {
        NE: [0, 1], E: [1, 2], SE: [2, 3], SW: [3, 4], W: [4, 5], NW: [5, 0],
    };
    const [c1, c2] = edgeDirToCorners[dir];
    const v1 = canonicalVertex(cornerSets[c1]);
    const v2 = canonicalVertex(cornerSets[c2]);
    return [v1, v2];
}
/**
 * Returns all EdgeIds emanating from a vertex.
 */
function vertexEdgeIds(vertexId, board) {
    const result = [];
    for (const edgeId of board.edges) {
        const [v1, v2] = edgeVertices(edgeId);
        if (v1 === vertexId || v2 === vertexId)
            result.push(edgeId);
    }
    return result;
}
/**
 * Returns all HexTiles that touch a given vertex.
 */
function vertexTiles(vertexId, board) {
    // Parse the vertex ID and find which hexes' corner sets include this vertex
    const tileMap = new Map(board.tiles.map(t => [coordKey(t.coord), t]));
    const result = [];
    for (const tile of board.tiles) {
        const corners = hexCornerHexSets(tile.coord);
        if (corners.some(set => canonicalVertex(set) === vertexId)) {
            result.push(tile);
        }
    }
    return result;
}
// ─── Board Generation ─────────────────────────────────────────────────────────
function shuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function seededRng(seed) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}
/**
 * Port positions: 9 ports placed around the edge of the board.
 * Each port is adjacent to one ocean edge and points to 2 vertices on the inland hex.
 */
const PORT_POSITIONS = [
    { coord: { q: 0, r: -2 }, dir: 'NW' }, // top-left of top row
    { coord: { q: 1, r: -2 }, dir: 'NE' }, // top-right of top row
    { coord: { q: 2, r: -2 }, dir: 'E' }, // right of top row
    { coord: { q: 2, r: -1 }, dir: 'E' }, // right of row 1 (wait — this overlaps)
    { coord: { q: 2, r: 0 }, dir: 'SE' }, // right of middle
    { coord: { q: 1, r: 1 }, dir: 'SE' }, // right of row 3
    { coord: { q: 0, r: 2 }, dir: 'SW' }, // bottom-right of bottom
    { coord: { q: -1, r: 2 }, dir: 'SW' }, // bottom-left of bottom
    { coord: { q: -2, r: 1 }, dir: 'W' }, // left of row 3
];
const PORT_RESOURCES = [
    { ratio: 2, resource: 'timber' },
    { ratio: 2, resource: 'clay' },
    { ratio: 2, resource: 'iron' },
    { ratio: 2, resource: 'grain' },
    { ratio: 2, resource: 'wool' },
    { ratio: 3, resource: null },
    { ratio: 3, resource: null },
    { ratio: 3, resource: null },
    { ratio: 3, resource: null },
];
function generateBoard(seed) {
    const rng = seededRng(seed ?? Math.floor(Math.random() * 0xffffffff));
    // Shuffle terrain
    const terrains = shuffle([...board_js_1.TERRAIN_DISTRIBUTION], rng);
    // Shuffle number tokens
    const tokens = shuffle([...board_js_1.NUMBER_TOKENS], rng);
    // Assign terrains and tokens to hex coords
    let tokenIdx = 0;
    const tiles = board_js_1.STANDARD_HEX_COORDS.map((coord, i) => {
        const terrain = terrains[i];
        const numberToken = terrain === 'desert' ? null : tokens[tokenIdx++];
        return {
            coord,
            terrain,
            numberToken,
            hasBandit: terrain === 'desert',
        };
    });
    // Collect all valid vertex and edge IDs
    const vertexSet = new Set();
    const edgeSet = new Set();
    const coordSet = new Set(board_js_1.STANDARD_HEX_COORDS.map(coordKey));
    for (const coord of board_js_1.STANDARD_HEX_COORDS) {
        for (const vid of hexVertexIds(coord)) {
            vertexSet.add(vid);
        }
        for (const eid of hexEdgeIds(coord)) {
            // Only include edges where both sharing hexes are on the board OR it's a boundary edge
            edgeSet.add(eid);
        }
    }
    // Shuffle port assignments
    const portResources = shuffle([...PORT_RESOURCES], rng);
    const ports = PORT_POSITIONS.map((pos, i) => {
        const pr = portResources[i];
        // Get the edge vertices for this port direction on this hex
        const edgeId = `${pos.coord.q}:${pos.coord.r}:${pos.dir}`;
        const [v1, v2] = edgeVertices(edgeId);
        return {
            ratio: pr.ratio,
            resource: pr.resource,
            vertices: [v1, v2],
            edgeCoord: pos.coord,
            edgeDir: pos.dir,
        };
    });
    return {
        tiles,
        ports,
        vertices: [...vertexSet],
        edges: [...edgeSet],
    };
}
// Find bandit starting location (desert tile)
function findDesertCoord(board) {
    const desert = board.tiles.find(t => t.terrain === 'desert');
    return desert?.coord ?? { q: 0, r: 0 };
}
//# sourceMappingURL=board.js.map