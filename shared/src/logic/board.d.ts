import type { AxialCoord, CubeCoord, VertexId, EdgeId, HexTile, BoardConfig } from '../types/board.js';
export declare function axialToCube(coord: AxialCoord): CubeCoord;
export declare function cubeToAxial(cube: CubeCoord): AxialCoord;
export declare function axialDistance(a: AxialCoord, b: AxialCoord): number;
export declare function axialEquals(a: AxialCoord, b: AxialCoord): boolean;
export declare function coordKey(coord: AxialCoord): string;
export declare const HEX_DIRECTIONS: AxialCoord[];
export declare const DIRECTION_NAMES: readonly ["E", "NE", "NW", "W", "SW", "SE"];
export declare function hexNeighbor(coord: AxialCoord, dirIndex: number): AxialCoord;
export declare function hexNeighbors(coord: AxialCoord): AxialCoord[];
export declare function hexVertexIds(coord: AxialCoord): VertexId[];
export declare function hexEdgeIds(coord: AxialCoord): EdgeId[];
/**
 * Returns the VertexIds of the 2-3 vertices adjacent to a given vertex.
 * Two vertices are adjacent if they share an edge.
 */
export declare function adjacentVertices(vertexId: VertexId, boardVertices: Set<VertexId>): VertexId[];
/**
 * Returns the two VertexIds at the ends of an edge.
 */
export declare function edgeVertices(edgeId: EdgeId): [VertexId, VertexId];
/**
 * Returns all EdgeIds emanating from a vertex.
 */
export declare function vertexEdgeIds(vertexId: VertexId, board: BoardConfig): EdgeId[];
/**
 * Returns all HexTiles that touch a given vertex.
 */
export declare function vertexTiles(vertexId: VertexId, board: BoardConfig): HexTile[];
export declare function generateBoard(seed?: number): BoardConfig;
export declare function findDesertCoord(board: BoardConfig): AxialCoord;
//# sourceMappingURL=board.d.ts.map