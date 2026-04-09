/**
 * Game-specific SVG icon components.
 * Two variants for each piece:
 *   - `Xxx` — standalone <svg> for use in HTML (buttons, panels)
 *   - `XxxSvg` — <g> fragment for use inside an existing SVG (board)
 */
import type { SVGProps } from 'react';

// ─── shared type ─────────────────────────────────────────────────────────────
interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
}

// ─── Settlement ──────────────────────────────────────────────────────────────
export function SettlementIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      {/* roof */}
      <polygon points="12,3 2,11 22,11" fill={color} stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
      {/* walls */}
      <rect x="4" y="11" width="16" height="10" fill={color} stroke="white" strokeWidth="1.5"/>
      {/* door */}
      <rect x="9" y="15" width="6" height="6" fill="rgba(0,0,0,0.25)"/>
    </svg>
  );
}

/** Render a settlement inside an SVG at board coordinates (cx, cy). */
export function SettlementSvg({
  cx, cy, fill, opacity = 1,
}: { cx: number; cy: number; fill: string; opacity?: number }) {
  return (
    <g opacity={opacity}>
      <polygon
        points={`${cx},${cy - 13} ${cx - 10},${cy - 2} ${cx + 10},${cy - 2}`}
        fill={fill} stroke="white" strokeWidth={1.5} strokeLinejoin="round"
      />
      <rect x={cx - 8} y={cy - 2} width={16} height={10} fill={fill} stroke="white" strokeWidth={1.5}/>
      <rect x={cx - 3} y={cy + 2} width={6} height={6} fill="rgba(0,0,0,0.2)"/>
    </g>
  );
}

// ─── City ─────────────────────────────────────────────────────────────────────
export function CityIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      {/* tall left tower */}
      <rect x="2" y="5" width="9" height="16" fill={color} stroke="white" strokeWidth="1.5"/>
      {/* battlements left tower */}
      <rect x="2"  y="2" width="2.5" height="4" fill={color} stroke="white" strokeWidth="1"/>
      <rect x="6.5" y="2" width="2.5" height="4" fill={color} stroke="white" strokeWidth="1"/>
      {/* right lower building */}
      <rect x="13" y="10" width="9" height="11" fill={color} stroke="white" strokeWidth="1.5"/>
      {/* windows */}
      <rect x="4" y="9" width="3" height="4" fill="rgba(0,0,0,0.25)"/>
      <rect x="15" y="13" width="3" height="4" fill="rgba(0,0,0,0.25)"/>
    </svg>
  );
}

/** Render a city inside an SVG at board coordinates (cx, cy). */
export function CitySvg({
  cx, cy, fill, opacity = 1,
}: { cx: number; cy: number; fill: string; opacity?: number }) {
  return (
    <g opacity={opacity}>
      {/* tall left tower */}
      <rect x={cx - 13} y={cy - 18} width={11} height={18} fill={fill} stroke="white" strokeWidth={1.5}/>
      {/* battlements */}
      <rect x={cx - 13} y={cy - 21} width={3} height={4} fill={fill} stroke="white" strokeWidth={1}/>
      <rect x={cx - 7}  y={cy - 21} width={3} height={4} fill={fill} stroke="white" strokeWidth={1}/>
      {/* right wing */}
      <rect x={cx - 2}  y={cy - 13} width={13} height={13} fill={fill} stroke="white" strokeWidth={1.5}/>
      {/* windows */}
      <rect x={cx - 11} y={cy - 14} width={3} height={4} fill="rgba(0,0,0,0.25)"/>
      <rect x={cx + 1}  y={cy - 10} width={3} height={4} fill="rgba(0,0,0,0.25)"/>
    </g>
  );
}

// ─── Road ─────────────────────────────────────────────────────────────────────
export function RoadIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <line x1="3" y1="18" x2="21" y2="6" stroke={color} strokeWidth="5" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Bandit ───────────────────────────────────────────────────────────────────
export function BanditIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      {/* hood */}
      <path d="M5,22 Q5,10 12,8 Q19,10 19,22 Z" fill="#2a2a2a" stroke={color} strokeWidth="1.5"/>
      {/* head */}
      <circle cx="12" cy="9" r="5" fill="#3a3a3a" stroke={color} strokeWidth="1.5"/>
      {/* eye holes */}
      <ellipse cx="9.5" cy="9" rx="1.5" ry="1.2" fill="#111"/>
      <ellipse cx="14.5" cy="9" rx="1.5" ry="1.2" fill="#111"/>
      {/* mouth grin */}
      <path d="M9,12 Q12,14 15,12" stroke="#666" strokeWidth="1" fill="none"/>
    </svg>
  );
}

/** Render a bandit token inside an SVG at (cx, cy). Optionally draggable. */
export function BanditSvg({
  cx, cy, draggable, onPointerDown,
}: {
  cx: number; cy: number;
  draggable?: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
}) {
  return (
    <g
      transform={`translate(${cx},${cy})`}
      style={{ cursor: draggable ? 'grab' : 'default' }}
      onPointerDown={onPointerDown}
    >
      {/* cloak */}
      <ellipse rx="13" ry="10" cy="10" fill="#1a1a1a" stroke="#888" strokeWidth="1.5"/>
      {/* head */}
      <circle cy="-4" r="9" fill="#2a2a2a" stroke="#888" strokeWidth="1.5"/>
      {/* eyes */}
      <ellipse cx="-3.5" cy="-4.5" rx="2" ry="1.8" fill="#111"/>
      <ellipse cx="3.5"  cy="-4.5" rx="2" ry="1.8" fill="#111"/>
      {/* nose bridge / mask */}
      <rect x="-5" y="-6" width="10" height="4" rx="2" fill="#1a1a1a" stroke="#666" strokeWidth="0.8"/>
      {/* grin */}
      <path d="M-4,0 Q0,3 4,0" stroke="#555" strokeWidth="1.2" fill="none"/>
    </g>
  );
}

// ─── Dev Card ─────────────────────────────────────────────────────────────────
export function DevCardIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="4" y="2" width="16" height="20" rx="2" fill="#1a3060" stroke={color} strokeWidth="1.5"/>
      {/* card back ornament */}
      <rect x="7" y="5" width="10" height="14" rx="1" fill="none" stroke={color} strokeWidth="0.8" opacity="0.6"/>
      <polygon points="12,7 14,11 12,15 10,11" fill={color} opacity="0.5"/>
    </svg>
  );
}

/** A floating card UI element (absolute/fixed positioned, follows cursor during drag). */
export function FloatingDevCard({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <div
      style={{ position: 'fixed', left: x - 30, top: y - 40, pointerEvents: 'none', zIndex: 9999 }}
      className="w-16 h-24 rounded-lg bg-blue-900 border-2 border-amber-400 shadow-xl flex flex-col items-center justify-center gap-1 select-none"
    >
      <DevCardIcon size={28} color="#f59e0b" />
      <span className="text-[9px] text-amber-300 text-center leading-tight px-1 text-pretty">{label}</span>
    </div>
  );
}

// ─── Resources ───────────────────────────────────────────────────────────────
export function TimberIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      {/* trunk */}
      <rect x="10" y="16" width="4" height="6" fill="#8B4513" stroke={color} strokeWidth="1"/>
      {/* crown layers */}
      <polygon points="12,2 5,12 8,12 6,16 18,16 16,12 19,12" fill="#2d6a2d" stroke={color} strokeWidth="1.2"/>
    </svg>
  );
}

export function ClayIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      {/* brick layers */}
      <rect x="2" y="4"  width="20" height="4" rx="1" fill="#c1440e" stroke={color} strokeWidth="0.8"/>
      <rect x="2" y="10" width="20" height="4" rx="1" fill="#a8340a" stroke={color} strokeWidth="0.8"/>
      <rect x="2" y="16" width="20" height="4" rx="1" fill="#c1440e" stroke={color} strokeWidth="0.8"/>
      {/* mortar lines */}
      <line x1="12" y1="4"  x2="12" y2="8"  stroke={color} strokeWidth="0.6" opacity="0.4"/>
      <line x1="7"  x2="7"  y1="10" y2="14" stroke={color} strokeWidth="0.6" opacity="0.4"/>
      <line x1="17" x2="17" y1="10" y2="14" stroke={color} strokeWidth="0.6" opacity="0.4"/>
      <line x1="12" y1="16" x2="12" y2="20" stroke={color} strokeWidth="0.6" opacity="0.4"/>
    </svg>
  );
}

export function IronIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      {/* back mountain */}
      <polygon points="14,20 20,8 26,20" fill="#4a5568" stroke={color} strokeWidth="1" clipPath="inset(0 2px 0 0)"/>
      {/* front mountain */}
      <polygon points="2,20 10,5 18,20" fill="#718096" stroke={color} strokeWidth="1.2"/>
      {/* snow cap */}
      <polygon points="10,5 7.5,12 12.5,12" fill="white" opacity="0.8"/>
    </svg>
  );
}

export function GrainIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      {/* stalk */}
      <line x1="12" y1="22" x2="12" y2="4" stroke="#8B6914" strokeWidth="2"/>
      {/* main head */}
      <ellipse cx="12" cy="7" rx="3" ry="5" fill="#d4a017" stroke={color} strokeWidth="1"/>
      {/* side heads */}
      <ellipse cx="8" cy="11" rx="2.2" ry="3.5" fill="#d4a017" stroke={color} strokeWidth="1" transform="rotate(-25,8,11)"/>
      <ellipse cx="16" cy="11" rx="2.2" ry="3.5" fill="#d4a017" stroke={color} strokeWidth="1" transform="rotate(25,16,11)"/>
    </svg>
  );
}

export function WoolIcon({ size = 24, color = 'currentColor', ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      {/* fluffy body */}
      <circle cx="8"  cy="12" r="4" fill="white" stroke={color} strokeWidth="1.2"/>
      <circle cx="12" cy="10" r="4" fill="white" stroke={color} strokeWidth="1.2"/>
      <circle cx="16" cy="12" r="4" fill="white" stroke={color} strokeWidth="1.2"/>
      <circle cx="12" cy="14" r="3.5" fill="white" stroke={color} strokeWidth="1"/>
      {/* legs */}
      <rect x="9"  y="17" width="2" height="4" rx="1" fill="#555"/>
      <rect x="13" y="17" width="2" height="4" rx="1" fill="#555"/>
      {/* face */}
      <circle cx="7" cy="12" r="1.5" fill="#aaa"/>
    </svg>
  );
}

// ─── Dice ─────────────────────────────────────────────────────────────────────
export function DiceIcon({ size = 24, color = 'currentColor', value = 6, ...p }: IconProps & { value?: number }) {
  const pipMap: Record<number, [number, number][]> = {
    1: [[12, 12]],
    2: [[7, 7], [17, 17]],
    3: [[7, 7], [12, 12], [17, 17]],
    4: [[7, 7], [17, 7], [7, 17], [17, 17]],
    5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
    6: [[7, 7], [17, 7], [7, 12], [17, 12], [7, 17], [17, 17]],
  };
  const pips = pipMap[Math.min(6, Math.max(1, value))] ?? [[12, 12] as [number, number]];

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="2" y="2" width="20" height="20" rx="4" fill="white" stroke={color} strokeWidth="1.5"/>
      {pips.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="2" fill={color}/>
      ))}
    </svg>
  );
}

// ─── resource map ─────────────────────────────────────────────────────────────
export const RESOURCE_ICON_MAP: Record<string, (p: IconProps) => JSX.Element> = {
  timber: (p) => <TimberIcon {...p}/>,
  clay:   (p) => <ClayIcon   {...p}/>,
  iron:   (p) => <IronIcon   {...p}/>,
  grain:  (p) => <GrainIcon  {...p}/>,
  wool:   (p) => <WoolIcon   {...p}/>,
};
