import { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicGameState, VertexId, EdgeId, AxialCoord, HexTile, ResourceType } from '@conqueror/shared';
import { edgeVertices, adjacentVertices, roadDistanceToVertex, vertexToVertexDistance, MAX_SOLDIERS_CITY, MAX_SOLDIERS_SETTLEMENT } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';
import { SettlementSvg, CitySvg, BanditSvg } from '../icons/GameIcons.js';
import {
  axialToPixel,
  hexCornerPoints,
  cornerPointsToString,
  vertexToPixel,
  edgeMidpoint,
  BOARD_VIEWBOX,
  LARGE_BOARD_VIEWBOX,
  TERRAIN_COLORS,
  TERRAIN_HIGHLIGHT,
  PLAYER_COLOR_HEX,
  resolvePlayerColor,
  tokenColor,
  TOKEN_PIPS,
} from './hexLayout.js';

interface HexBoardProps {
  state: PublicGameState;
  playerCosmetics?: Record<string, { road: string; building: string }>;
}

const SNAP_RADIUS = 28;

function pageToSvg(svg: SVGSVGElement, pageX: number, pageY: number) {
  const pt = svg.createSVGPoint();
  pt.x = pageX; pt.y = pageY;
  const m = svg.getScreenCTM();
  if (!m) return null;
  const { x, y } = pt.matrixTransform(m.inverse());
  return { x, y };
}

function nearestVertex(svgX: number, svgY: number, vertices: readonly string[]): VertexId | null {
  let best: VertexId | null = null, bestDist = SNAP_RADIUS;
  for (const vid of vertices) {
    const p = vertexToPixel(vid as VertexId);
    const d = Math.hypot(p.x - svgX, p.y - svgY);
    if (d < bestDist) { bestDist = d; best = vid as VertexId; }
  }
  return best;
}

function nearestEdge(svgX: number, svgY: number, edges: readonly string[]): EdgeId | null {
  let best: EdgeId | null = null, bestDist = SNAP_RADIUS;
  for (const eid of edges) {
    const m = edgeMidpoint(eid as EdgeId);
    const d = Math.hypot(m.x - svgX, m.y - svgY);
    if (d < bestDist) { bestDist = d; best = eid as EdgeId; }
  }
  return best;
}

function nearestTile(svgX: number, svgY: number, tiles: HexTile[]): AxialCoord | null {
  let best: AxialCoord | null = null, bestDist = Infinity;
  for (const tile of tiles) {
    const c = axialToPixel(tile.coord);
    const d = Math.hypot(c.x - svgX, c.y - svgY);
    if (d < bestDist) { bestDist = d; best = tile.coord; }
  }
  return best;
}

// ── Client-side placement validity filters (geometric only, no resource check) ─

function validSettlementVerts(state: PublicGameState, playerId: string): Set<VertexId> {
  const boardSet = new Set(state.board.vertices as VertexId[]);
  const isSetup = state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE';
  const valid = new Set<VertexId>();
  for (const vid of state.board.vertices as VertexId[]) {
    if (state.buildings[vid]) continue;
    const adj = adjacentVertices(vid, boardSet);
    if (adj.some(v => state.buildings[v])) continue;
    if (!isSetup) {
      const hasRoad = (state.board.edges as EdgeId[]).some(eid => {
        const [v1, v2] = edgeVertices(eid);
        return (v1 === vid || v2 === vid) && state.roads[eid]?.playerId === playerId;
      });
      if (!hasRoad) continue;
    }
    valid.add(vid);
  }
  return valid;
}

function validCityVerts(state: PublicGameState, playerId: string): Set<VertexId> {
  const valid = new Set<VertexId>();
  for (const vid of state.board.vertices as VertexId[]) {
    const b = state.buildings[vid] as any;
    if (b && b.playerId === playerId && b.type === 'settlement' && !b.sieged) valid.add(vid);
  }
  return valid;
}

function connectsAt(state: PublicGameState, playerId: string, edgeId: EdgeId, vertexId: VertexId): boolean {
  const b = state.buildings[vertexId];
  if (b && b.playerId !== playerId) return false;
  if (b && b.playerId === playerId) return true;
  return (state.board.edges as EdgeId[]).some(eid2 => {
    if (eid2 === edgeId) return false;
    const [a, c] = edgeVertices(eid2);
    return (a === vertexId || c === vertexId) && state.roads[eid2]?.playerId === playerId;
  });
}

function validRoadEdges(state: PublicGameState, playerId: string): Set<EdgeId> {
  const valid = new Set<EdgeId>();
  for (const eid of state.board.edges as EdgeId[]) {
    if (state.roads[eid]) continue;
    const [v1, v2] = edgeVertices(eid);
    if (connectsAt(state, playerId, eid, v1) || connectsAt(state, playerId, eid, v2)) {
      valid.add(eid);
    }
  }
  return valid;
}

/** Inner-edge highlight polygon — slightly scaled inward from each hex */
function innerHexPoints(center: { x: number; y: number }, scale = 0.88): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const r = 60 * scale;
    return `${center.x + r * Math.cos(angle)},${center.y + r * Math.sin(angle)}`;
  }).join(' ');
}

/** Terrain icon drawn inside each hex tile (SVG, centered at cx/cy offset from tile center) */
function TerrainIcon({ terrain, cx, cy }: { terrain: string; cx: number; cy: number }) {
  const op = 0.55; // base opacity — readable but not overwhelming
  const hi = { opacity: op };

  if (terrain === 'timber') {
    // Three pine trees
    return (
      <g style={hi} pointerEvents="none">
        {([-14, 0, 14] as number[]).map((dx, i) => (
          <g key={i} transform={`translate(${cx + dx},${cy})`}>
            <polygon points="0,-14 -8,0 8,0" fill="#4ade80" opacity={0.9}/>
            <polygon points="0,-22 -10,-6 10,-6" fill="#22c55e" opacity={0.7}/>
            <rect x={-2} y={0} width={4} height={7} fill="#854d0e" opacity={0.8}/>
          </g>
        ))}
      </g>
    );
  }

  if (terrain === 'clay') {
    // Brick wall pattern — 4 rows × 3 bricks, offset every other row
    const bricks: { x: number; y: number; key: string }[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        bricks.push({
          x: cx - 27 + col * 18 + (row % 2 === 0 ? 0 : 9),
          y: cy - 16 + row * 9,
          key: `${row}-${col}`,
        });
      }
    }
    return (
      <g style={hi} pointerEvents="none">
        {bricks.map(b => (
          <rect key={b.key} x={b.x} y={b.y} width={16} height={7}
            fill="#f97316" stroke="#7c2d12" strokeWidth={1} rx={1} opacity={0.85}/>
        ))}
      </g>
    );
  }

  if (terrain === 'iron') {
    // Mountain peaks
    return (
      <g style={hi} pointerEvents="none">
        {/* Back peak */}
        <polygon points={`${cx},${cy - 26} ${cx - 20},${cy + 4} ${cx + 20},${cy + 4}`}
          fill="#94a3b8" opacity={0.5}/>
        {/* Snow cap */}
        <polygon points={`${cx},${cy - 26} ${cx - 6},${cy - 14} ${cx + 6},${cy - 14}`}
          fill="#f1f5f9" opacity={0.8}/>
        {/* Left peak */}
        <polygon points={`${cx - 16},${cy - 14} ${cx - 30},${cy + 4} ${cx - 2},${cy + 4}`}
          fill="#64748b" opacity={0.7}/>
        {/* Right peak */}
        <polygon points={`${cx + 16},${cy - 16} ${cx + 2},${cy + 4} ${cx + 30},${cy + 4}`}
          fill="#64748b" opacity={0.65}/>
      </g>
    );
  }

  if (terrain === 'grain') {
    // Wheat stalks
    return (
      <g style={hi} pointerEvents="none">
        {([-16, -8, 0, 8, 16] as number[]).map((dx, i) => {
          const yBase = cy + 8;
          const lean = (dx / 16) * 5;
          return (
            <g key={i}>
              <line x1={cx + dx} y1={yBase} x2={cx + dx + lean} y2={cy - 18}
                stroke="#fbbf24" strokeWidth={1.5} opacity={0.8}/>
              {/* grain head */}
              <ellipse cx={cx + dx + lean} cy={cy - 20} rx={3} ry={7}
                fill="#fcd34d" opacity={0.9}/>
              {/* side grains */}
              <line x1={cx + dx + lean - 1} y1={cy - 22} x2={cx + dx + lean - 5} y2={cy - 16}
                stroke="#fbbf24" strokeWidth={1} opacity={0.7}/>
              <line x1={cx + dx + lean + 1} y1={cy - 22} x2={cx + dx + lean + 5} y2={cy - 16}
                stroke="#fbbf24" strokeWidth={1} opacity={0.7}/>
            </g>
          );
        })}
      </g>
    );
  }

  if (terrain === 'wool') {
    // Two fluffy sheep
    return (
      <g style={hi} pointerEvents="none">
        {([-14, 10] as number[]).map((dx, i) => (
          <g key={i} transform={`translate(${cx + dx},${cy - 4})`}>
            {/* Body (fluffy cloud) */}
            <circle cx={0}  cy={0} r={9}  fill="#e2e8f0" opacity={0.9}/>
            <circle cx={7}  cy={2} r={7}  fill="#f1f5f9" opacity={0.85}/>
            <circle cx={-6} cy={3} r={7}  fill="#e2e8f0" opacity={0.85}/>
            <circle cx={2}  cy={-5} r={6} fill="#f8fafc" opacity={0.8}/>
            {/* Head */}
            <circle cx={10} cy={-3} r={5} fill="#cbd5e1" opacity={0.95}/>
            {/* Eye */}
            <circle cx={12} cy={-4} r={1} fill="#1e293b"/>
            {/* Legs */}
            <rect x={-4} y={8} width={3} height={8} fill="#94a3b8" rx={1}/>
            <rect x={1}  y={8} width={3} height={8} fill="#94a3b8" rx={1}/>
          </g>
        ))}
      </g>
    );
  }

  if (terrain === 'desert') {
    // Sun above dune lines
    return (
      <g style={hi} pointerEvents="none">
        {/* Sun */}
        <circle cx={cx} cy={cy - 14} r={8} fill="#fde68a" opacity={0.9}/>
        {([0, 45, 90, 135, 180, 225, 270, 315] as number[]).map(angle => {
          const rad = (angle * Math.PI) / 180;
          return (
            <line key={angle}
              x1={cx + Math.cos(rad) * 10} y1={cy - 14 + Math.sin(rad) * 10}
              x2={cx + Math.cos(rad) * 14} y2={cy - 14 + Math.sin(rad) * 14}
              stroke="#fcd34d" strokeWidth={1.5} opacity={0.8}/>
          );
        })}
        {/* Dune lines */}
        <path d={`M ${cx - 28},${cy + 6} Q ${cx - 14},${cy - 2} ${cx},${cy + 6} Q ${cx + 14},${cy + 14} ${cx + 28},${cy + 6}`}
          fill="none" stroke="#d97706" strokeWidth={2} opacity={0.7}/>
        <path d={`M ${cx - 22},${cy + 14} Q ${cx - 8},${cy + 6} ${cx + 8},${cy + 14} Q ${cx + 18},${cy + 20} ${cx + 28},${cy + 14}`}
          fill="none" stroke="#b45309" strokeWidth={1.5} opacity={0.5}/>
      </g>
    );
  }

  return null;
}

const ROAD_SKIN_STYLES: Record<string, { width: number; highlight: string; shadow: string; extraDash?: string }> = {
  road_default: { width: 5,   highlight: 'rgba(255,255,255,0.15)', shadow: 'rgba(0,0,0,0.5)' },
  road_iron:    { width: 6,   highlight: 'rgba(150,180,200,0.25)', shadow: 'rgba(0,0,0,0.7)' },
  road_stone:   { width: 5.5, highlight: 'rgba(160,160,170,0.3)',  shadow: 'rgba(0,0,0,0.6)', extraDash: '9 2' },
  road_gold:    { width: 5,   highlight: 'rgba(251,191,36,0.5)',   shadow: 'rgba(120,80,0,0.6)' },
};

const BUILDING_SKIN_STROKE: Record<string, string> = {
  building_default: 'white',
  building_iron:    '#64748b',
  building_stone:   '#94a3b8',
  building_gold:    '#f59e0b',
};

function RoadSvg({ edgeId, color, opacity = 1, dashed = false, skin = 'road_default' }: {
  edgeId: EdgeId; color: string; opacity?: number; dashed?: boolean; skin?: string;
}) {
  const [v1id, v2id] = edgeVertices(edgeId);
  const p1 = vertexToPixel(v1id), p2 = vertexToPixel(v2id);
  const s = ROAD_SKIN_STYLES[skin] ?? ROAD_SKIN_STYLES.road_default;
  return (
    <>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={s.shadow} strokeWidth={s.width + 3} strokeLinecap="round" opacity={opacity}/>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={color} strokeWidth={s.width} strokeLinecap="round" opacity={opacity}
        strokeDasharray={dashed ? '7 4' : (s.extraDash ?? undefined)}/>
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={s.highlight} strokeWidth={1.5} strokeLinecap="round" opacity={opacity}/>
    </>
  );
}

const PORT_COLOR: Record<string, { bg: string; border: string; icon: string }> = {
  timber: { bg: '#0f2e14', border: '#22c55e', icon: '🪵' },
  clay:   { bg: '#3b1004', border: '#f97316', icon: '🧱' },
  iron:   { bg: '#131c2b', border: '#94a3b8', icon: '⚙️' },
  grain:  { bg: '#2e1d02', border: '#fbbf24', icon: '🌾' },
  wool:   { bg: '#092b1b', border: '#86efac', icon: '🐑' },
  any:    { bg: '#1a1a2e', border: '#6b7280', icon: '✦' },
};

function PortLabel({
  vertices, resource, ratio,
}: {
  vertices: string[];
  resource: ResourceType | null;
  ratio: number;
}) {
  if (vertices.length < 2) return null;
  const p1 = vertexToPixel(vertices[0] as VertexId);
  const p2 = vertexToPixel(vertices[1] as VertexId);
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

  // Push the label outward from board center
  const dist = Math.hypot(mid.x, mid.y);
  const nx = dist > 0 ? mid.x / dist : 0;
  const ny = dist > 0 ? mid.y / dist : -1;
  const lx = mid.x + nx * 30;
  const ly = mid.y + ny * 30;

  const key = resource ?? 'any';
  const theme = PORT_COLOR[key] ?? PORT_COLOR.any;

  const isSpecific = resource !== null;
  // Specific ports: taller badge with icon on top + ratio below
  // Any ports:      original-size badge with "✦ 3:1" centered
  const bW = 34;
  const bH = isSpecific ? 38 : 26;
  const bX = lx - bW / 2;
  const bY = ly - bH / 2;

  return (
    <g>
      {/* Dock — connects the two coastal vertices */}
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={theme.border} strokeWidth={3} opacity={0.7}
        strokeLinecap="round"/>
      {/* Badge background */}
      <rect x={bX} y={bY} width={bW} height={bH} rx={7}
        fill={theme.bg} stroke={theme.border} strokeWidth={1.5} opacity={0.95}/>
      {isSpecific ? (
        <>
          {/* Emoji icon — upper portion of badge */}
          <text x={lx} y={ly - 4} textAnchor="middle" fontSize={15} style={{ userSelect: 'none' }}>
            {theme.icon}
          </text>
          {/* Divider */}
          <line x1={bX + 4} y1={ly + 6} x2={bX + bW - 4} y2={ly + 6}
            stroke={theme.border} strokeWidth={0.8} opacity={0.4}/>
          {/* Ratio — lower portion */}
          <text x={lx} y={ly + 16} textAnchor="middle" fontSize={9} fontWeight="bold" fill={theme.border} style={{ userSelect: 'none' }}>
            {ratio}:1
          </text>
        </>
      ) : (
        /* Any port: symbol + ratio side by side */
        <text x={lx} y={ly + 5} textAnchor="middle" fontSize={10} fontWeight="bold" fill={theme.border} style={{ userSelect: 'none' }}>
          {theme.icon} {ratio}:1
        </text>
      )}
    </g>
  );
}

const MIN_DRAG_PX = 12; // minimum screen pixels to move before a drag becomes a placement

export default function HexBoard({ state, playerCosmetics = {} }: HexBoardProps) {
  const { t } = useTranslation('game');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStartClientPos = useRef<{ x: number; y: number } | null>(null);

  const {
    boardMode, setBoardMode,
    isMyTurn,
    roadBuildingEdges, addRoadBuildingEdge,
    setPendingBanditCoord,
    dragPiece, setDragPiece,
    cancelRoadBuilding,
    localPlayerId,
    setAttackTargetVertex,
    transferFromVertex, setTransferFromVertex,
    addToast,
  } = useGameStore();

  const myTurn = isMyTurn();

  // Pre-compute valid placement positions (must be before snapVertex uses them)
  const myId = localPlayerId ?? '';
  let validSettVerts: Set<VertexId> | null = null;
  let validCityVerts_: Set<VertexId> | null = null;
  let validEdges: Set<EdgeId> | null = null;
  try {
    if (boardMode === 'place_settlement' && myTurn) validSettVerts = validSettlementVerts(state, myId);
    if (boardMode === 'place_city'       && myTurn) validCityVerts_ = validCityVerts(state, myId);
    if (boardMode === 'place_road'       && myTurn) {
      // When using Road Building card, simulate already-selected edges so the second
      // road can be highlighted even if it only connects through the first.
      const simState = roadBuildingEdges?.length
        ? { ...state, roads: { ...state.roads, ...Object.fromEntries(roadBuildingEdges.map(e => [e, { playerId: myId }])) } }
        : state;
      validEdges = validRoadEdges(simState, myId);
    }
  } catch { /* fall back to showing all positions */ }

  const snapVertex: VertexId | null =
    dragPiece && (dragPiece.type === 'settlement' || dragPiece.type === 'city')
      ? nearestVertex(dragPiece.svgX, dragPiece.svgY,
          dragPiece.type === 'settlement' && validSettVerts
            ? [...validSettVerts]
            : dragPiece.type === 'city' && validCityVerts_
            ? [...validCityVerts_]
            : state.board.vertices)
      : null;
  const snapEdge: EdgeId | null =
    dragPiece?.type === 'road'
      ? nearestEdge(dragPiece.svgX, dragPiece.svgY,
          validEdges ? [...validEdges] : state.board.edges)
      : null;
  const snapTile: AxialCoord | null =
    dragPiece?.type === 'bandit'
      ? nearestTile(dragPiece.svgX, dragPiece.svgY, state.board.tiles) : null;
  const validSnapTile = snapTile &&
    !(snapTile.q === state.banditLocation.q && snapTile.r === state.banditLocation.r)
    ? snapTile : null;

  const handleDragMove = useCallback((e: PointerEvent) => {
    if (!svgRef.current) return;
    const p = pageToSvg(svgRef.current, e.clientX, e.clientY);
    if (!p) return;
    setDragPiece({ ...useGameStore.getState().dragPiece!, svgX: p.x, svgY: p.y });
  }, []);

  const handleDragEnd = useCallback((e: PointerEvent) => {
    document.removeEventListener('pointermove', handleDragMove);
    document.removeEventListener('pointerup', handleDragEnd);
    const current = useGameStore.getState().dragPiece;
    if (!current || !svgRef.current) { setDragPiece(null); dragStartClientPos.current = null; return; }

    // Require minimum drag distance to prevent accidental placement on quick button taps
    const start = dragStartClientPos.current;
    dragStartClientPos.current = null;
    if (start) {
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist < MIN_DRAG_PX) { setDragPiece(null); return; }
    }

    const p = pageToSvg(svgRef.current, e.clientX, e.clientY);
    if (!p) { setDragPiece(null); return; }
    const { type } = current;
    if (type === 'settlement' || type === 'city') {
      const t = nearestVertex(p.x, p.y, state.board.vertices);
      if (t) { wsService.send({ type: 'PLACE_BUILDING', payload: { gameId: state.gameId, vertexId: t, type } }); setBoardMode(null); }
    } else if (type === 'road') {
      const t = nearestEdge(p.x, p.y, state.board.edges);
      if (t) {
        if (roadBuildingEdges !== null) addRoadBuildingEdge(t);
        else { wsService.send({ type: 'PLACE_ROAD', payload: { gameId: state.gameId, edgeId: t } }); setBoardMode(null); }
      }
    } else if (type === 'bandit') {
      const t = nearestTile(p.x, p.y, state.board.tiles);
      if (t && !(t.q === state.banditLocation.q && t.r === state.banditLocation.r))
        setPendingBanditCoord(t);
    }
    setDragPiece(null);
  }, [state, roadBuildingEdges, handleDragMove]);

  useEffect(() => {
    (window as any).__hexBoardStartDrag = (
      type: 'settlement' | 'city' | 'road',
      clientX: number, clientY: number,
    ) => {
      if (!svgRef.current) return;
      const p = pageToSvg(svgRef.current, clientX, clientY);
      if (!p) return;
      dragStartClientPos.current = { x: clientX, y: clientY };
      setDragPiece({ type, svgX: p.x, svgY: p.y });
      document.addEventListener('pointermove', handleDragMove);
      document.addEventListener('pointerup', handleDragEnd);
    };
    return () => { delete (window as any).__hexBoardStartDrag; };
  }, [handleDragMove, handleDragEnd]);

  function handleVertexClick(vertexId: VertexId) {
    if (dragPiece) return;

    // War: recruit soldier (own building, any turn — gated by server)
    if (boardMode === 'recruit_soldier' && myTurn) {
      wsService.send({ type: 'RECRUIT_SOLDIER', payload: { gameId: state.gameId, vertexId } });
      setBoardMode(null);
      return;
    }

    // War: select attack target (enemy building)
    if (boardMode === 'attack' && myTurn) {
      const building = (state.buildings as any)[vertexId];
      if (building && building.playerId !== localPlayerId) {
        setAttackTargetVertex(vertexId);
      }
      return;
    }

    // War: transfer soldiers — tap 1 = source, tap 2 = destination
    if (boardMode === 'transfer_soldiers' && myTurn) {
      const building = (state.buildings as any)[vertexId];
      if (!building || building.playerId !== localPlayerId) return;
      if (!transferFromVertex) {
        // First tap: select source (must have soldiers)
        if ((building.soldiers ?? 0) > 0) {
          setTransferFromVertex(vertexId);
        } else {
          addToast({ type: 'action', playerId: '__error__', username: '⚠️', data: { action: 'NO_SOLDIERS', extra: 'Este edificio no tiene soldados' } });
        }
      } else if (vertexId === transferFromVertex) {
        // Tap same: deselect
        setTransferFromVertex(null);
      } else {
        // Second tap: destination → send transfer immediately
        const max = building.type === 'city' ? MAX_SOLDIERS_CITY : MAX_SOLDIERS_SETTLEMENT;
        const free = max - (building.soldiers ?? 0);
        if (free > 0) {
          const fromB = (state.buildings as any)[transferFromVertex];
          const available = fromB?.soldiers ?? 0;
          const count = Math.min(available, free);
          if (count > 0) {
            wsService.send({ type: 'TRANSFER_SOLDIERS', payload: { gameId: state.gameId, fromVertexId: transferFromVertex, toVertexId: vertexId, count } });
          }
          setTransferFromVertex(null);
          setBoardMode(null);
        } else {
          addToast({ type: 'action', playerId: '__error__', username: '⚠️', data: { action: 'DEST_FULL', extra: `Capacidad máxima: ${max} soldados` } });
        }
      }
      return;
    }

    if (!myTurn) return;
    if (boardMode === 'place_settlement' || boardMode === 'place_city') {
      wsService.send({ type: 'PLACE_BUILDING', payload: {
        gameId: state.gameId, vertexId, type: boardMode === 'place_city' ? 'city' : 'settlement',
      } });
      setBoardMode(null);
    }
  }

  function handleEdgeClick(edgeId: EdgeId) {
    if (!myTurn || dragPiece) return;
    if (boardMode === 'place_road') {
      if (roadBuildingEdges !== null) addRoadBuildingEdge(edgeId);
      else { wsService.send({ type: 'PLACE_ROAD', payload: { gameId: state.gameId, edgeId } }); setBoardMode(null); }
    }
  }

  function handleTileClick(coord: AxialCoord) {
    if (!myTurn) return;
    if (boardMode === 'move_bandit') {
      // Cannot place bandit on its current tile; silently ignore (happens when user taps bandit icon)
      if (coord.q === state.banditLocation.q && coord.r === state.banditLocation.r) return;
      setPendingBanditCoord(coord);
    }
  }

  function handleBanditPointerDown(e: React.PointerEvent<SVGGElement>) {
    if (!myTurn || boardMode !== 'move_bandit' || !svgRef.current) return;
    // Do NOT stopPropagation so that a tap (non-drag) on the bandit icon still
    // falls through to the tile's onClick handler (which gracefully handles same-tile).
    const p = pageToSvg(svgRef.current, e.clientX, e.clientY);
    if (!p) return;
    setDragPiece({ type: 'bandit', svgX: p.x, svgY: p.y });
    document.addEventListener('pointermove', handleDragMove);
    document.addEventListener('pointerup', handleDragEnd);
  }

  // ── Dice-roll tile glow ─────────────────────────────────────────────────────
  const [glowCoords, setGlowCoords] = useState<Set<string>>(new Set());
  const glowTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const roll = state.diceRoll;
    if (!roll) { setGlowCoords(new Set()); return; }
    const total = roll[0] + roll[1];
    if (total === 7) { setGlowCoords(new Set()); return; }
    const matching = new Set(
      state.board.tiles
        .filter(t => t.numberToken === total && t.terrain !== 'desert')
        .map(t => `${t.coord.q}:${t.coord.r}`)
    );
    setGlowCoords(matching);
    clearTimeout(glowTimer.current);
    glowTimer.current = setTimeout(() => setGlowCoords(new Set()), 4500);
    return () => clearTimeout(glowTimer.current);
  }, [state.diceRoll]);

  const isRobberClickable = boardMode === 'move_bandit' && myTurn && !dragPiece;
  const isVertexClickable = (boardMode === 'place_settlement' || boardMode === 'place_city' || boardMode === 'recruit_soldier' || boardMode === 'attack' || boardMode === 'transfer_soldiers') && myTurn && !dragPiece;
  const isEdgeClickable   = boardMode === 'place_road' && myTurn && !dragPiece;
  const showDragVertex    = dragPiece && (dragPiece.type === 'settlement' || dragPiece.type === 'city');
  const showDragEdge      = dragPiece?.type === 'road';
  const showDragBandit    = dragPiece?.type === 'bandit';
  const myColor = state.players.find(p => p.id === localPlayerId)?.color ?? 'red';

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        ref={svgRef}
        viewBox={state.board.tiles.length > 19 ? LARGE_BOARD_VIEWBOX : BOARD_VIEWBOX}
        className="max-w-full max-h-full"
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          {/* Subtle vignette for ocean depth */}
          <radialGradient id="oceanGrad" cx="50%" cy="50%" r="70%">
            <stop offset="0%"   stopColor="#0d2a4a"/>
            <stop offset="100%" stopColor="#060e1c"/>
          </radialGradient>
          {/* Hex inner glow on hover */}
          <filter id="hexGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"/>
            <feFlood floodColor="#ffcc00" floodOpacity="0.3" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="shadow"/>
            <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Token glow for 6 and 8 */}
          <filter id="hotGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur"/>
            <feFlood floodColor="#dc2626" floodOpacity="0.5" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="shadow"/>
            <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Dice-roll tile glow */}
          <filter id="diceGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur"/>
            <feFlood floodColor="#fbbf24" floodOpacity="0.9" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Deep ocean background */}
        <rect x="-400" y="-400" width="800" height="800" fill="url(#oceanGrad)"/>

        {/* Ocean grid lines (subtle depth lines) */}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1="-400" y1={-400 + i * 100} x2="400" y2={-400 + i * 100}
            stroke="rgba(255,255,255,0.02)" strokeWidth={1}/>
        ))}

        {/* ── Ports — rendered before tiles so badges float in the ocean ── */}
        {state.board.ports.map((port, i) => (
          <PortLabel key={i} vertices={port.vertices} resource={port.resource as ResourceType | null} ratio={port.ratio}/>
        ))}

        {/* ── Hex tiles ── */}
        {state.board.tiles.map(tile => {
          const center = axialToPixel(tile.coord);
          const corners = hexCornerPoints(center);
          const pts = cornerPointsToString(corners);
          const innerPts = innerHexPoints(center, 0.87);
          const fillColor = TERRAIN_COLORS[tile.terrain] ?? '#1a2a1a';
          const hlColor   = TERRAIN_HIGHLIGHT[tile.terrain] ?? '#2a3a2a';
          const pips = tile.numberToken ? TOKEN_PIPS[tile.numberToken] : 0;
          const isHot = tile.numberToken === 6 || tile.numberToken === 8;
          const isBandit = state.banditLocation.q === tile.coord.q && state.banditLocation.r === tile.coord.r;
          const isSnapTarget = showDragBandit && !isBandit &&
            validSnapTile?.q === tile.coord.q && validSnapTile?.r === tile.coord.r;
          // All tiles (including bandit's tile) receive click events in ROBBER mode
          // so that a tap on the bandit icon can fall through. handleTileClick guards same-tile.
          const clickable = isRobberClickable;

          const isGlowing = glowCoords.has(`${tile.coord.q}:${tile.coord.r}`);
          // Visual clickable (amber border + pointer cursor): non-bandit tiles only
          const visuallyClickable = clickable && !isBandit;

          return (
            <g key={`${tile.coord.q}:${tile.coord.r}`}
              onClick={() => clickable && handleTileClick(tile.coord)}
              style={{ cursor: visuallyClickable ? 'pointer' : 'default' }}>
              {/* Outer hex — dark border */}
              <polygon points={pts} fill={fillColor}
                stroke={isSnapTarget ? '#ffcc00' : visuallyClickable ? '#ffcc00' : isGlowing ? '#fbbf24' : 'rgba(0,0,0,0.6)'}
                strokeWidth={isSnapTarget ? 3 : visuallyClickable ? 2.5 : isGlowing ? 2 : 1.5}/>

              {/* Inner highlight edge — simulates 3D bevel */}
              <polygon points={innerPts} fill="none"
                stroke={hlColor} strokeWidth={1} opacity={0.5}/>

              {/* Terrain icon */}
              <TerrainIcon terrain={tile.terrain} cx={center.x} cy={center.y - (tile.numberToken ? 14 : 0)}/>

              {/* Drag-over bandit tint */}
              {showDragBandit && !isBandit && (
                <polygon points={pts} fill="rgba(255,200,0,0.1)" stroke="rgba(255,200,0,0.3)" strokeWidth={2}
                  style={{ pointerEvents: 'none' }}/>
              )}

              {/* Dice-roll glow: pulsing ring + fill */}
              {isGlowing && (
                <g style={{ pointerEvents: 'none' }}>
                  <polygon points={pts} fill="rgba(251,191,36,0.10)" stroke="none">
                    <animate attributeName="fill-opacity" values="0.10;0.22;0.10" dur="0.9s" repeatCount="indefinite"/>
                  </polygon>
                  <polygon points={pts} fill="none" stroke="#fbbf24" filter="url(#diceGlow)">
                    <animate attributeName="stroke-width" values="2;5;2" dur="0.9s" repeatCount="indefinite"/>
                    <animate attributeName="stroke-opacity" values="1;0.35;1" dur="0.9s" repeatCount="indefinite"/>
                  </polygon>
                </g>
              )}

              {/* Number token */}
              {tile.numberToken && (
                <g filter={isGlowing ? 'url(#diceGlow)' : isHot ? 'url(#hotGlow)' : undefined}>
                  {/* Ripple ring expanding from token when glowing */}
                  {isGlowing && (
                    <circle cx={center.x} cy={center.y} r={18} fill="none" stroke="#fbbf24" strokeWidth={2} style={{ pointerEvents: 'none' }}>
                      <animate attributeName="r" values="18;32;18" dur="0.9s" repeatCount="indefinite"/>
                      <animate attributeName="stroke-opacity" values="0.9;0;0.9" dur="0.9s" repeatCount="indefinite"/>
                    </circle>
                  )}
                  {/* Token disc */}
                  <circle cx={center.x} cy={center.y} r={18}
                    fill="#0a0a0a" stroke={isHot ? '#ff4444' : '#2a2a2a'} strokeWidth={2}/>
                  <circle cx={center.x} cy={center.y} r={15}
                    fill="none" stroke={isHot ? '#ff444440' : '#ffffff18'} strokeWidth={1}/>
                  <text x={center.x} y={center.y + 5}
                    textAnchor="middle" fontSize={13} fontWeight="bold"
                    fill={tokenColor(tile.numberToken)}>
                    {tile.numberToken}
                  </text>
                  {/* Probability pips */}
                  {Array.from({ length: pips }, (_, i) => (
                    <circle key={i}
                      cx={center.x - ((pips - 1) * 3.5) + i * 7} cy={center.y + 15}
                      r={2} fill={tokenColor(tile.numberToken!)}/>
                  ))}
                </g>
              )}

              {/* Bandit token */}
              {isBandit && !showDragBandit && (
                <BanditSvg cx={center.x} cy={center.y - 14}
                  draggable={myTurn && boardMode === 'move_bandit'}
                  onPointerDown={handleBanditPointerDown}/>
              )}
            </g>
          );
        })}

        {/* ── Roads ── */}
        {Object.entries(state.roads).map(([edgeId, road]) => {
          const playerColor = state.players.find(p => p.id === road.playerId)?.color ?? 'red';
          const roadSkin = playerCosmetics[road.playerId]?.road ?? 'road_default';
          return <RoadSvg key={edgeId} edgeId={edgeId as EdgeId} color={resolvePlayerColor(playerColor)} skin={roadSkin}/>;
        })}

        {/* ── Buildings ── */}
        {Object.entries(state.buildings).map(([vertexId, building]) => {
          const pos = vertexToPixel(vertexId as VertexId);
          const playerColor = state.players.find(p => p.id === building.playerId)?.color ?? 'red';
          const fill = resolvePlayerColor(playerColor);
          const bldSkin = playerCosmetics[building.playerId]?.building ?? 'building_default';
          const bldStroke = BUILDING_SKIN_STROKE[bldSkin] ?? 'white';
          const bld = building as any;
          const soldiers: number = bld.soldiers ?? 0;
          const sieged: boolean = !!bld.sieged;
          return (
            <g key={vertexId}>
              {/* Siege ring */}
              {sieged && (
                <circle cx={pos.x} cy={pos.y} r={18}
                  fill="none" stroke="#ef4444" strokeWidth={2.5} opacity={0.85}
                  strokeDasharray="5 3"/>
              )}
              {building.type === 'settlement'
                ? <SettlementSvg cx={pos.x} cy={pos.y} fill={fill} stroke={bldStroke}/>
                : <CitySvg       cx={pos.x} cy={pos.y} fill={fill} stroke={bldStroke}/>
              }
              {/* Soldier helmets — 🪖 emoji per soldier, dashed ring for empty slots */}
              {(state as any).warMode && (() => {
                const max = building.type === 'city' ? 3 : 2;
                if (soldiers === 0 && !sieged) return null;
                const spacing = 14;
                const totalW = (max - 1) * spacing;
                const rowCY = pos.y + (building.type === 'city' ? 14 : 17);
                const bgW = totalW + 22;
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={pos.x - bgW / 2} y={rowCY - 9} width={bgW} height={17} rx={8}
                      fill="rgba(2,6,23,0.85)" stroke="rgba(255,255,255,0.12)" strokeWidth={0.5}/>
                    {Array.from({ length: max }, (_, i) => {
                      const cx = pos.x - totalW / 2 + i * spacing;
                      return i < soldiers ? (
                        <text key={i} x={cx} y={rowCY + 4} textAnchor="middle" fontSize={11}
                          style={{ userSelect: 'none' }}>
                          🪖
                        </text>
                      ) : (
                        <circle key={i} cx={cx} cy={rowCY} r={4}
                          fill="none" stroke="rgba(107,114,128,0.6)" strokeWidth={1}
                          strokeDasharray="2 2"/>
                      );
                    })}
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* ── Drag ghosts ── */}
        {showDragEdge && snapEdge && (
          <RoadSvg edgeId={snapEdge} color={resolvePlayerColor(myColor)} opacity={0.65} dashed/>
        )}
        {showDragVertex && snapVertex && (() => {
          const pos = vertexToPixel(snapVertex);
          const fill = resolvePlayerColor(myColor);
          return dragPiece!.type === 'settlement'
            ? <SettlementSvg cx={pos.x} cy={pos.y} fill={fill} opacity={0.6}/>
            : <CitySvg       cx={pos.x} cy={pos.y} fill={fill} opacity={0.6}/>;
        })()}
        {showDragBandit && dragPiece && (
          <BanditSvg cx={dragPiece.svgX} cy={dragPiece.svgY}/>
        )}

        {/* ── Click vertex overlays ── */}
        {isVertexClickable && state.board.vertices.map(vid => {
          if (boardMode === 'recruit_soldier') {
            // Show own buildings with capacity
            const b = (state.buildings as any)[vid];
            if (!b || b.playerId !== localPlayerId || b.sieged) return null;
            const max = b.type === 'city' ? 3 : 2;
            if ((b.soldiers ?? 0) >= max) return null;
            const pos = vertexToPixel(vid as VertexId);
            return (
              <circle key={vid} cx={pos.x} cy={pos.y} r={12}
                fill="rgba(251,191,36,0.3)" stroke="#fbbf24" strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onClick={() => handleVertexClick(vid as VertexId)}/>
            );
          }
          if (boardMode === 'transfer_soldiers') {
            const b = (state.buildings as any)[vid];
            if (!b || b.playerId !== localPlayerId) return null;
            const pos = vertexToPixel(vid as VertexId);
            const isSource = vid === transferFromVertex;
            const hasSoldiers = (b.soldiers ?? 0) > 0;
            const maxCap = b.type === 'city' ? MAX_SOLDIERS_CITY : MAX_SOLDIERS_SETTLEMENT;
            const hasFree = (b.soldiers ?? 0) < maxCap;
            const maxTransferDist = 2 + ((state as any).transferDistanceBonus ?? 0);
            const dist = transferFromVertex
              ? vertexToVertexDistance(state as any, transferFromVertex, vid)
              : 0;
            const inRange = !transferFromVertex || vid === transferFromVertex || dist <= maxTransferDist;
            // Source phase: show buildings with soldiers; Dest phase: all own buildings (full = greyed)
            if (!transferFromVertex && !hasSoldiers) return null;
            if (transferFromVertex && !isSource && !inRange) return null;
            const isFull = transferFromVertex && !isSource && !hasFree;
            const color = isSource ? '#f97316' : isFull ? '#6b7280' : transferFromVertex ? '#60a5fa' : '#fbbf24';
            return (
              <circle key={vid} cx={pos.x} cy={pos.y} r={13}
                fill={`${color}33`} stroke={color} strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onClick={() => handleVertexClick(vid as VertexId)}/>
            );
          }
          if (boardMode === 'attack') {
            const b = (state.buildings as any)[vid];
            if (!b || b.playerId === localPlayerId) return null;
            const victim = state.players.find((p: any) => p.id === b.playerId);
            const victimVP = (victim?.victoryPoints ?? 0) + (victim?.victoryPointCards ?? 0);
            const dist = roadDistanceToVertex(state as any, localPlayerId!, vid as VertexId);
            const outOfRange = dist > 2;
            const vpProtected = victimVP <= 2;
            const canTarget = !outOfRange && !vpProtected;
            const pos = vertexToPixel(vid as VertexId);
            const reason = outOfRange ? 'Out of range (>2 roads)' : vpProtected ? 'Protected (≤2 VP)' : null;
            return (
              <g key={vid}>
                <circle cx={pos.x} cy={pos.y} r={14}
                  fill={canTarget ? 'rgba(239,68,68,0.25)' : 'rgba(107,114,128,0.15)'}
                  stroke={canTarget ? '#ef4444' : '#6b7280'}
                  strokeWidth={canTarget ? 2 : 1.5}
                  strokeDasharray={canTarget ? undefined : '3 2'}
                  style={{ cursor: canTarget ? 'crosshair' : 'not-allowed' }}
                  onClick={() => canTarget ? handleVertexClick(vid as VertexId) : undefined}/>
                {reason && (
                  <text x={pos.x} y={pos.y - 18} textAnchor="middle" fontSize={8}
                    fill="#9ca3af" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {reason}
                  </text>
                )}
              </g>
            );
          }
          const isValid = boardMode === 'place_settlement'
            ? validSettVerts?.has(vid as VertexId)
            : validCityVerts_?.has(vid as VertexId);
          if (!isValid) return null;
          const pos = vertexToPixel(vid as VertexId);
          return (
            <circle key={vid} cx={pos.x} cy={pos.y} r={10}
              fill="rgba(255,220,0,0.3)" stroke="#ffcc00" strokeWidth={1.5}
              style={{ cursor: 'pointer' }}
              onClick={() => handleVertexClick(vid as VertexId)}/>
          );
        })}

        {/* ── Drag vertex snap targets ── */}
        {showDragVertex && state.board.vertices.map(vid => {
          const validSet = boardMode === 'place_settlement' ? validSettVerts : validCityVerts_;
          if (!validSet?.has(vid as VertexId)) return null;
          const pos = vertexToPixel(vid as VertexId);
          const isSnap = vid === snapVertex;
          return (
            <circle key={vid} cx={pos.x} cy={pos.y} r={isSnap ? 14 : 8}
              fill={isSnap ? 'rgba(255,220,0,0.65)' : 'rgba(255,220,0,0.2)'}
              stroke={isSnap ? '#ffcc00' : 'rgba(255,220,0,0.4)'}
              strokeWidth={isSnap ? 2.5 : 1.5}/>
          );
        })}

        {/* ── Click edge overlays ── */}
        {isEdgeClickable && state.board.edges.map(eid => {
          if (!validEdges?.has(eid as EdgeId)) return null;
          const mid = edgeMidpoint(eid as EdgeId);
          return (
            <circle key={eid} cx={mid.x} cy={mid.y} r={8}
              fill="rgba(255,220,0,0.3)" stroke="#ffcc00" strokeWidth={1.5}
              style={{ cursor: 'pointer' }}
              onClick={() => handleEdgeClick(eid as EdgeId)}/>
          );
        })}

        {/* ── Drag edge snap targets ── */}
        {showDragEdge && state.board.edges.map(eid => {
          if (!validEdges?.has(eid as EdgeId)) return null;
          const mid = edgeMidpoint(eid as EdgeId);
          const isSnap = eid === snapEdge;
          return (
            <circle key={eid} cx={mid.x} cy={mid.y} r={isSnap ? 12 : 6}
              fill={isSnap ? 'rgba(255,220,0,0.65)' : 'rgba(255,220,0,0.15)'}
              stroke={isSnap ? '#ffcc00' : 'rgba(255,220,0,0.35)'}
              strokeWidth={isSnap ? 2.5 : 1.5}/>
          );
        })}
      </svg>

      {/* Mode bar */}
      {boardMode && !dragPiece && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/90 border border-amber-600 text-amber-300 px-5 py-2 rounded-full text-sm font-medium shadow-xl flex items-center gap-3 backdrop-blur-sm">
          <span>
            {boardMode === 'place_settlement' && t('actions.buildSettlement')}
            {boardMode === 'place_city'       && t('actions.buildCity')}
            {boardMode === 'place_road' && (roadBuildingEdges !== null
              ? `Road Building: road ${roadBuildingEdges.length + 1}/2`
              : t('actions.buildRoad'))}
            {boardMode === 'move_bandit'      && t('bandit.selectTile')}
            {boardMode === 'recruit_soldier'  && '🪖 Select a building to recruit'}
            {boardMode === 'attack'           && '⚔️ Select an enemy building to attack'}
            {boardMode === 'transfer_soldiers' && !transferFromVertex && '🪖 Tap a building to move soldiers from'}
            {boardMode === 'transfer_soldiers' && transferFromVertex  && '🪖 Now tap the destination building'}
          </span>
          {boardMode === 'move_bandit'
            ? <span className="text-xs opacity-60">Drag or click a tile</span>
            : <button className="text-xs underline opacity-70 hover:opacity-100" aria-label="Cancel"
                onClick={() => { setBoardMode(null); cancelRoadBuilding(); }}>Cancel</button>
          }
        </div>
      )}

      {/* Drag hint */}
      {dragPiece && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/90 border border-gray-600 text-gray-300 px-5 py-2 rounded-full text-sm shadow-xl pointer-events-none select-none backdrop-blur-sm">
          {dragPiece.type === 'bandit'
            ? (validSnapTile ? '✓ Release to move bandit' : 'Drag to a tile…')
            : (snapVertex || snapEdge ? '✓ Release to place' : 'Drag to a valid position…')
          }
        </div>
      )}
    </div>
  );
}
