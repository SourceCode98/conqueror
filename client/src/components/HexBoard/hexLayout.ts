import type { AxialCoord, VertexId, EdgeId } from '@conqueror/shared';
import { edgeVertices } from '@conqueror/shared';

export const HEX_SIZE = 60; // circumradius in pixels

/** Convert axial coordinates to pixel position (pointy-top hex) */
export function axialToPixel(coord: AxialCoord): { x: number; y: number } {
  const x = HEX_SIZE * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = HEX_SIZE * (3 / 2) * coord.r;
  return { x, y };
}

/** Get the 6 corners of a pointy-top hex at a pixel center */
export function hexCornerPoints(center: { x: number; y: number }): Array<{ x: number; y: number }> {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top: start at -30 deg
    return {
      x: center.x + HEX_SIZE * Math.cos(angle),
      y: center.y + HEX_SIZE * Math.sin(angle),
    };
  });
}

/** Convert hex corners to SVG polygon points string */
export function cornerPointsToString(corners: Array<{ x: number; y: number }>): string {
  return corners.map(c => `${c.x},${c.y}`).join(' ');
}

/**
 * Clockwise corner angles for a pointy-top hex, matching the 6-label canonical
 * vertex scheme in shared/src/logic/board.ts:
 *   N  = top         (angle -90 deg)
 *   NE = upper-right (angle -30 deg)
 *   SE = lower-right (angle  30 deg)
 *   S  = bottom      (angle  90 deg)
 *   SW = lower-left  (angle 150 deg)
 *   NW = upper-left  (angle 210 deg)
 */
const VERTEX_ANGLES: Record<string, number> = {
  N:  -90,
  NE: -30,
  SE:  30,
  S:   90,
  SW: 150,
  NW: 210,
};

/** Get pixel position for a vertex ID ("q:r:LABEL"). */
export function vertexToPixel(vertexId: VertexId): { x: number; y: number } {
  const parts = vertexId.split(':');
  const q = parseInt(parts[0]);
  const r = parseInt(parts[1]);
  const label = parts[2];
  const center = axialToPixel({ q, r });
  const angle = (Math.PI / 180) * (VERTEX_ANGLES[label] ?? -90);
  return {
    x: center.x + HEX_SIZE * Math.cos(angle),
    y: center.y + HEX_SIZE * Math.sin(angle),
  };
}

/** Get the midpoint pixel for an edge */
export function edgeMidpoint(edgeId: EdgeId): { x: number; y: number } {
  const [v1, v2] = edgeVertices(edgeId);
  const p1 = vertexToPixel(v1);
  const p2 = vertexToPixel(v2);
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

/** SVG viewBox covering the full standard board */
export const BOARD_VIEWBOX = '-280 -280 560 560';

/** Color map for terrain types — each terrain has a clearly distinct hue */
export const TERRAIN_COLORS: Record<string, string> = {
  timber: '#0d3518',   // dark pine green
  clay:   '#6e1804',   // deep burnt sienna
  iron:   '#1a2640',   // dark slate blue-grey
  grain:  '#5c3d00',   // deep amber-brown
  wool:   '#2a5c00',   // vivid meadow green (lighter/yellower than timber)
  desert: '#5c4a18',   // warm sandy tan
};

/** Slightly lighter highlight for the inner hex edge effect */
export const TERRAIN_HIGHLIGHT: Record<string, string> = {
  timber: '#1a5c28',   // mid forest green
  clay:   '#a0300e',   // bright brick red
  iron:   '#2a3e5c',   // steel blue
  grain:  '#9a6a00',   // golden amber
  wool:   '#48a000',   // bright lime-green
  desert: '#8a7030',   // warm sand highlight
};

/** Legacy named-color → hex map (for games created before free-pick colors) */
export const PLAYER_COLOR_HEX: Record<string, string> = {
  red:    '#ef4444',
  blue:   '#3b82f6',
  green:  '#22c55e',
  orange: '#f97316',
};

/**
 * Resolve a player color value to a CSS hex string.
 * Accepts both legacy named colors ("red") and new free-pick hex values ("#e53e3e").
 */
export function resolvePlayerColor(color: string): string {
  if (color.startsWith('#')) return color;
  return PLAYER_COLOR_HEX[color] ?? '#888888';
}

/** Number token colors — high contrast against the dark token disc */
export function tokenColor(num: number): string {
  return num === 6 || num === 8 ? '#ff4444' : '#f5f0e8';
}

/** Probability dots (pips) for each number token */
export const TOKEN_PIPS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};
