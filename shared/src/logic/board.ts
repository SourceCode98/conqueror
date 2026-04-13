import type { AxialCoord, CubeCoord, VertexId, EdgeId, HexTile, BoardConfig, Port } from '../types/board.js';
import type { TerrainType } from '../types/resources.js';
import {
  STANDARD_HEX_COORDS,
  TERRAIN_DISTRIBUTION,
  NUMBER_TOKENS,
  LARGE_HEX_COORDS,
  LARGE_TERRAIN_DISTRIBUTION,
  LARGE_NUMBER_TOKENS,
  LARGE_PORT_POSITIONS,
  LARGE_PORT_RESOURCES,
} from '../constants/board.js';

// ─── Coordinate Math ──────────────────────────────────────────────────────────

export function axialToCube(coord: AxialCoord): CubeCoord {
  return { x: coord.q, y: -coord.q - coord.r, z: coord.r };
}

export function cubeToAxial(cube: CubeCoord): AxialCoord {
  return { q: cube.x, r: cube.z };
}

export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const ca = axialToCube(a);
  const cb = axialToCube(b);
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
}

export function axialEquals(a: AxialCoord, b: AxialCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function coordKey(coord: AxialCoord): string {
  return `${coord.q}:${coord.r}`;
}

// ─── Neighbor Directions (pointy-top, axial) ──────────────────────────────────

// Directions in order: E, NE, NW, W, SW, SE
export const HEX_DIRECTIONS: AxialCoord[] = [
  { q: 1, r: 0 },   // 0: E
  { q: 1, r: -1 },  // 1: NE
  { q: 0, r: -1 },  // 2: NW
  { q: -1, r: 0 },  // 3: W
  { q: -1, r: 1 },  // 4: SW
  { q: 0, r: 1 },   // 5: SE
];

export const DIRECTION_NAMES = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;

export function hexNeighbor(coord: AxialCoord, dirIndex: number): AxialCoord {
  const d = HEX_DIRECTIONS[dirIndex];
  return { q: coord.q + d.q, r: coord.r + d.r };
}

export function hexNeighbors(coord: AxialCoord): AxialCoord[] {
  return HEX_DIRECTIONS.map(d => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

// ─── Vertex IDs ───────────────────────────────────────────────────────────────
//
// Each hex has 6 corners. In a pointy-top hex grid, we define two canonical
// corners per hex: 'N' (top) and 'S' (bottom). Every grid vertex is either
// the N or S corner of exactly one canonical hex.
//
// For corner i (0-5, clockwise from top-right):
//   corners 0,1 → belong to a hex to the NE/E direction
//   corners 2,3 → belong to this hex as S corner of neighbors
//   etc.
//
// Simpler canonical form: each vertex is shared by 3 hexes. We assign it to
// the hex with the lexicographically smallest (q, r) among the 3, labeling
// it either 'N' or 'S' relative to that hex.
//
// The 6 corners of a hex H(q,r), clockwise from top:
//   0: top      → shared with H(q,r-1) and H(q+1,r-1)  → this is the S corner of H(q,r-1) if q,r-1 < both others
//   1: top-right → shared with H(q+1,r-1) and H(q+1,r)
//   2: bot-right → shared with H(q+1,r) and H(q,r+1)    → this is the N corner of H(q,r+1) if ...
//   3: bottom    → shared with H(q,r+1) and H(q-1,r+1)
//   4: bot-left  → shared with H(q-1,r+1) and H(q-1,r)
//   5: top-left  → shared with H(q-1,r) and H(q,r-1)
//
// For each corner, the 3 hexes that share it:
//   corner 0 (top):       H(q,r), H(q,r-1),    H(q+1,r-1)
//   corner 1 (top-right): H(q,r), H(q+1,r-1),  H(q+1,r)
//   corner 2 (bot-right): H(q,r), H(q+1,r),    H(q,r+1)   ← but we only use 3 corners per hex for uniqueness
//   corner 3 (bottom):    H(q,r), H(q,r+1),    H(q-1,r+1)
//   corner 4 (bot-left):  H(q,r), H(q-1,r+1),  H(q-1,r)
//   corner 5 (top-left):  H(q,r), H(q-1,r),    H(q,r-1)
//
// To avoid double-counting, each hex "owns" only corners 0 (N/top) and 2 (NE-bottom → "S" of neighbor).
// Actually the cleanest approach: each hex owns corners 0 and 3 only (top and bottom).
// Then top is the 'N' vertex, bottom is the 'S' vertex.
// But we need the canonical hex to be the one with smallest (q, r).
//
// Final rule:
//   Top vertex of H(q,r): also shared by H(q,r-1) and H(q+1,r-1)
//     → canonical hex = min({H(q,r), H(q,r-1), H(q+1,r-1)}) by (q then r)
//     → if canonical is H(q,r): label 'N'
//     → if canonical is H(q+1,r-1): label 'S'
//     → if canonical is H(q,r-1): label 'S'
//
// This is complex. Instead we use a direct lookup:
//
// For each hex, the 6 corners map to (neighbor_set, label) pairs.
// We pick the canonical vertex ID by finding the minimum hex (by r then q) among the
// sharing hexes, then identify which of that hex's 6 corners this vertex is.
//
// Labels correspond to corner positions in a pointy-top hex (clockwise from top):
//   N  = top        (angle -90°)
//   NE = upper-right (angle -30°)
//   SE = lower-right (angle  30°)
//   S  = bottom      (angle  90°)
//   SW = lower-left  (angle 150°)
//   NW = upper-left  (angle 210°)
//
// This avoids the collision bug of the old N/S-only scheme where two geometrically
// distinct vertices (e.g. corners 2 and 3 of the same hex) both mapped to "q:r:S".

type VertexPos = 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW';
const CORNER_LABELS: VertexPos[] = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];

function hexKey(h: AxialCoord): string { return `${h.q},${h.r}`; }

function canonicalVertex(hexes: AxialCoord[]): VertexId {
  // Sort by (r, then q) to find the canonical (topmost-leftmost) hex
  const sorted = [...hexes].sort((a, b) => a.r !== b.r ? a.r - b.r : a.q - b.q);
  const min = sorted[0];
  const sortedKey = sorted.map(hexKey).join('|');

  // Find which corner index of `min` this sharing-set corresponds to
  const cornerSets = hexCornerHexSets(min);
  const cornerIdx = cornerSets.findIndex(set => {
    const setSorted = [...set].sort((a, b) => a.r !== b.r ? a.r - b.r : a.q - b.q);
    return setSorted.map(hexKey).join('|') === sortedKey;
  });

  const label: VertexPos = cornerIdx >= 0 ? CORNER_LABELS[cornerIdx] : 'N';
  return `${min.q}:${min.r}:${label}`;
}

// The 6 corners of hex H(q,r), each as a set of 3 sharing hexes:
function hexCornerHexSets(coord: AxialCoord): AxialCoord[][] {
  const { q, r } = coord;
  return [
    [{ q, r }, { q, r: r - 1 }, { q: q + 1, r: r - 1 }], // corner 0: top
    [{ q, r }, { q: q + 1, r: r - 1 }, { q: q + 1, r }],  // corner 1: top-right
    [{ q, r }, { q: q + 1, r }, { q, r: r + 1 }],          // corner 2: bot-right
    [{ q, r }, { q, r: r + 1 }, { q: q - 1, r: r + 1 }],  // corner 3: bottom
    [{ q, r }, { q: q - 1, r: r + 1 }, { q: q - 1, r }],  // corner 4: bot-left
    [{ q, r }, { q: q - 1, r }, { q, r: r - 1 }],          // corner 5: top-left
  ];
}

export function hexVertexIds(coord: AxialCoord): VertexId[] {
  return hexCornerHexSets(coord).map(canonicalVertex);
}

// ─── Edge IDs ─────────────────────────────────────────────────────────────────
//
// Each edge is shared by 2 hexes. Canonical form: we pick 3 edges per hex
// (NE, E, SE directions) so every edge is represented exactly once.
// Edge between H(q,r) and neighbor in direction d:
//   → owned by the hex with smaller (r, then q)
//   → direction label relative to the owning hex
//
// The 6 edge directions and their neighbor-facing direction:
//   NE edge: between H and H(q+1,r-1) — direction index 1
//   E  edge: between H and H(q+1,r)   — direction index 0
//   SE edge: between H and H(q,r+1)   — direction index 5
//   SW edge: between H and H(q-1,r+1) — direction index 4
//   W  edge: between H and H(q-1,r)   — direction index 3
//   NW edge: between H and H(q,r-1)   — direction index 2
//
// Canonical: for each pair (H, neighbor), use the hex with smaller (r, q).
// Label: always from the perspective of the smaller hex.

type EdgeDir = 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW';

const EDGE_DIR_INDEX: Record<EdgeDir, number> = {
  NE: 1, E: 0, SE: 5, SW: 4, W: 3, NW: 2,
};

const OPPOSITE_DIR: Record<EdgeDir, EdgeDir> = {
  NE: 'SW', E: 'W', SE: 'NW', SW: 'NE', W: 'E', NW: 'SE',
};

const EDGE_DIRS: EdgeDir[] = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];

function canonicalEdge(a: AxialCoord, b: AxialCoord, dirFromA: EdgeDir): EdgeId {
  // Pick the "smaller" hex as canonical (by r, then q)
  const aIsSmaller = a.r < b.r || (a.r === b.r && a.q < b.q);
  if (aIsSmaller) {
    return `${a.q}:${a.r}:${dirFromA}`;
  } else {
    return `${b.q}:${b.r}:${OPPOSITE_DIR[dirFromA]}`;
  }
}

export function hexEdgeIds(coord: AxialCoord): EdgeId[] {
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
export function adjacentVertices(vertexId: VertexId, boardVertices: Set<VertexId>): VertexId[] {
  // Parse the vertex ID to find the hex and position
  const parts = vertexId.split(':');
  const q = parseInt(parts[0]);
  const r = parseInt(parts[1]);
  const pos = parts[2] as VertexPos;
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
  const adj: VertexId[] = [];
  const prev = hexCornerHexSets(coord)[(myCornerIndex + 5) % 6];
  const next = hexCornerHexSets(coord)[(myCornerIndex + 1) % 6];
  const prevId = canonicalVertex(prev);
  const nextId = canonicalVertex(next);

  if (boardVertices.has(prevId)) adj.push(prevId);
  if (boardVertices.has(nextId)) adj.push(nextId);

  // Also find the third adjacent vertex across the shared hex
  // Each vertex belongs to 3 hexes. For each neighboring hex, add its adjacent corners too.
  const sharingHexes = cornerSets[myCornerIndex];
  for (const hex of sharingHexes) {
    if (axialEquals(hex, coord)) continue;
    const neighborCorners = hexCornerHexSets(hex);
    const idxInNeighbor = neighborCorners.findIndex(set => canonicalVertex(set) === vertexId);
    if (idxInNeighbor !== -1) {
      const p = canonicalVertex(neighborCorners[(idxInNeighbor + 5) % 6]);
      const n = canonicalVertex(neighborCorners[(idxInNeighbor + 1) % 6]);
      if (p !== vertexId && !adj.includes(p) && boardVertices.has(p)) adj.push(p);
      if (n !== vertexId && !adj.includes(n) && boardVertices.has(n)) adj.push(n);
    }
  }

  return adj;
}

function findAdjacentVerticesGeneral(vertexId: VertexId, boardVertices: Set<VertexId>): VertexId[] {
  // Fallback: look through all board vertices for edge connections
  const result: VertexId[] = [];
  for (const vid of boardVertices) {
    if (vid === vertexId) continue;
    if (shareEdge(vertexId, vid)) result.push(vid);
  }
  return result;
}

function shareEdge(v1: VertexId, v2: VertexId, hexCoords: AxialCoord[] = STANDARD_HEX_COORDS): boolean {
  // Two vertices share an edge if they appear consecutively in any hex's corner list
  for (const coord of hexCoords) {
    const corners = hexCornerHexSets(coord).map(canonicalVertex);
    for (let i = 0; i < 6; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      if ((a === v1 && b === v2) || (a === v2 && b === v1)) return true;
    }
  }
  return false;
}

/**
 * Returns the two VertexIds at the ends of an edge.
 */
export function edgeVertices(edgeId: EdgeId): [VertexId, VertexId] {
  const parts = edgeId.split(':');
  const q = parseInt(parts[0]);
  const r = parseInt(parts[1]);
  const dir = parts[2] as EdgeDir;
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
  const edgeDirToCorners: Record<EdgeDir, [number, number]> = {
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
export function vertexEdgeIds(vertexId: VertexId, board: BoardConfig): EdgeId[] {
  const result: EdgeId[] = [];
  for (const edgeId of board.edges) {
    const [v1, v2] = edgeVertices(edgeId);
    if (v1 === vertexId || v2 === vertexId) result.push(edgeId);
  }
  return result;
}

/**
 * Returns all HexTiles that touch a given vertex.
 */
export function vertexTiles(vertexId: VertexId, board: BoardConfig): HexTile[] {
  // Parse the vertex ID and find which hexes' corner sets include this vertex
  const tileMap = new Map(board.tiles.map(t => [coordKey(t.coord), t]));
  const result: HexTile[] = [];
  for (const tile of board.tiles) {
    const corners = hexCornerHexSets(tile.coord);
    if (corners.some(set => canonicalVertex(set) === vertexId)) {
      result.push(tile);
    }
  }
  return result;
}

// ─── Board Generation ─────────────────────────────────────────────────────────

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seededRng(seed: number): () => number {
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
const PORT_POSITIONS: Array<{ coord: AxialCoord; dir: 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW' }> = [
  { coord: { q: 0, r: -2 }, dir: 'NW' },   // top-left of top row
  { coord: { q: 1, r: -2 }, dir: 'NE' },   // top-right of top row
  { coord: { q: 2, r: -2 }, dir: 'E' },    // right of top row
  { coord: { q: 2, r: -1 }, dir: 'E' },    // right of row 1 (wait — this overlaps)
  { coord: { q: 2, r: 0 },  dir: 'SE' },   // right of middle
  { coord: { q: 1, r: 1 },  dir: 'SE' },   // right of row 3
  { coord: { q: 0, r: 2 },  dir: 'SW' },   // bottom-right of bottom
  { coord: { q: -1, r: 2 }, dir: 'SW' },   // bottom-left of bottom
  { coord: { q: -2, r: 1 }, dir: 'W' },    // left of row 3
];

const PORT_RESOURCES: Array<{ ratio: 2 | 3; resource: 'timber' | 'clay' | 'iron' | 'grain' | 'wool' | null }> = [
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

export function generateBoard(seed?: number, large = false): BoardConfig {
  const rng = seededRng(seed ?? Math.floor(Math.random() * 0xffffffff));

  const hexCoords = large ? LARGE_HEX_COORDS : STANDARD_HEX_COORDS;
  const terrainDist = large ? LARGE_TERRAIN_DISTRIBUTION : TERRAIN_DISTRIBUTION;
  const numberTokens = large ? LARGE_NUMBER_TOKENS : NUMBER_TOKENS;
  const portPositions = large ? LARGE_PORT_POSITIONS : PORT_POSITIONS;
  const portResourceList = large ? LARGE_PORT_RESOURCES : PORT_RESOURCES;

  // Shuffle terrain
  const terrains = shuffle([...terrainDist] as TerrainType[], rng);

  // Shuffle number tokens
  const tokens = shuffle([...numberTokens], rng);

  // Assign terrains and tokens to hex coords
  let tokenIdx = 0;
  const tiles: HexTile[] = hexCoords.map((coord, i) => {
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
  const vertexSet = new Set<VertexId>();
  const edgeSet = new Set<EdgeId>();

  for (const coord of hexCoords) {
    for (const vid of hexVertexIds(coord)) {
      vertexSet.add(vid);
    }
    for (const eid of hexEdgeIds(coord)) {
      edgeSet.add(eid);
    }
  }

  // Shuffle port assignments
  const portResources = shuffle([...portResourceList], rng);

  const ports: Port[] = portPositions.map((pos, i) => {
    const pr = portResources[i];
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
export function findDesertCoord(board: BoardConfig): AxialCoord {
  const desert = board.tiles.find(t => t.terrain === 'desert');
  return desert?.coord ?? { q: 0, r: 0 };
}
