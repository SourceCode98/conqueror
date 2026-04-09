import type { TerrainType, ResourceType } from './resources.js';

/** Axial coordinate for hex grid */
export interface AxialCoord {
  q: number;
  r: number;
}

/** Cube coordinate — used for distance and neighbor math */
export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Vertex ID — canonical string identifying a hex corner shared by up to 3 hexes.
 * Format: "q:r:N" or "q:r:S" where q,r is the canonical (lowest) hex.
 */
export type VertexId = string;

/**
 * Edge ID — canonical string identifying a hex edge shared by up to 2 hexes.
 * Format: "q:r:NE" | "q:r:E" | "q:r:SE" where q,r is the canonical hex.
 */
export type EdgeId = string;

export interface HexTile {
  coord: AxialCoord;
  terrain: TerrainType;
  numberToken: number | null; // null for desert
  hasBandit: boolean;
}

export interface Port {
  ratio: 2 | 3;
  resource: ResourceType | null; // null = generic 3:1
  vertices: [VertexId, VertexId];
  edgeCoord: AxialCoord; // hex adjacent to the ocean edge (for rendering)
  edgeDir: 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW';
}

export interface BoardConfig {
  tiles: HexTile[];
  ports: Port[];
  vertices: VertexId[];
  edges: EdgeId[];
}
