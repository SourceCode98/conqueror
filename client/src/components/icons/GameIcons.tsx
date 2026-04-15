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
  cx, cy, fill, opacity = 1, stroke = 'white', skin = 'building_default',
}: { cx: number; cy: number; fill: string; opacity?: number; stroke?: string; skin?: string }) {
  const d = ((cx * 7 + cy * 13) % 20) / 10; // pseudo-random 0–2 per building

  if (skin === 'building_iron') {
    // Bronze — Rustic log cabin
    return (
      <g opacity={opacity} style={{ pointerEvents: 'none' }}>
        {/* Stone chimney */}
        <rect x={cx+4} y={cy-19} width={5} height={9} rx={0.5} fill="#5c4030" stroke={stroke} strokeWidth={0.9}/>
        <rect x={cx+3} y={cy-21} width={7} height={2.5} rx={0.5} fill="#4a3020" stroke={stroke} strokeWidth={0.8}/>
        {/* Smoke */}
        {[0,1,2].map(i => (
          <circle key={i} cx={cx+6.5+i*0.4} cy={cy-24-i*4} r={1.5+i*0.5} fill="rgba(190,190,190,0.55)">
            <animate attributeName="cy"
              values={`${cy-24-i*4};${cy-31-i*4};${cy-24-i*4}`}
              dur={`${1.8+i*0.4+d}s`} repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.55;0.08;0.55"
              dur={`${1.8+i*0.4+d}s`} repeatCount="indefinite"/>
          </circle>
        ))}
        {/* Thatched roof — layered for depth */}
        <polygon points={`${cx},${cy-16} ${cx-13},${cy-1} ${cx+13},${cy-1}`}
          fill="#7c5a0a" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round"/>
        <polygon points={`${cx},${cy-15} ${cx-12},${cy-2} ${cx+12},${cy-2}`}
          fill="#9a6e10" opacity={0.75} strokeLinejoin="round"/>
        {/* Thatch texture lines */}
        {([-7,-3,1,5] as number[]).map(dx => (
          <line key={dx} x1={cx+dx} y1={cy-12+Math.abs(dx)*0.25}
            x2={cx+dx*0.55} y2={cy-1} stroke="rgba(0,0,0,0.22)" strokeWidth={0.8}/>
        ))}
        {/* Log wall */}
        <rect x={cx-11} y={cy-1} width={22} height={12} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Log texture */}
        {[2,5,8].map(dy => (
          <line key={dy} x1={cx-11} y1={cy-1+dy} x2={cx+11} y2={cy-1+dy}
            stroke={stroke} strokeWidth={0.5} opacity={0.35}/>
        ))}
        {/* Door */}
        <rect x={cx-3.5} y={cy+3} width={7} height={9} rx={1}
          fill="rgba(0,0,0,0.38)" stroke={stroke} strokeWidth={0.8}/>
        {/* Door knob */}
        <circle cx={cx+2} cy={cy+7} r={0.9} fill={stroke} opacity={0.6}/>
        {/* Window with warm flicker */}
        <rect x={cx-10} y={cy+1} width={5} height={4} rx={0.6} fill="#fde68a">
          <animate attributeName="opacity" values="0.82;0.45;0.82"
            dur={`${2.5+d}s`} repeatCount="indefinite"/>
        </rect>
        {/* Window frame cross */}
        <line x1={cx-7.5} y1={cy+1} x2={cx-7.5} y2={cy+5} stroke={stroke} strokeWidth={0.5} opacity={0.5}/>
      </g>
    );
  }

  if (skin === 'building_stone') {
    // Silver — Stone cottage
    return (
      <g opacity={opacity} style={{ pointerEvents: 'none' }}>
        {/* Small turret right */}
        <rect x={cx+7} y={cy-20} width={6} height={10} fill={fill} stroke={stroke} strokeWidth={1.2}/>
        <rect x={cx+7}  y={cy-23} width={2.5} height={3.5} fill={fill} stroke={stroke} strokeWidth={0.9}/>
        <rect x={cx+10.5} y={cy-23} width={2.5} height={3.5} fill={fill} stroke={stroke} strokeWidth={0.9}/>
        {/* Slate tile roof */}
        <polygon points={`${cx},${cy-17} ${cx-13},${cy-2} ${cx+13},${cy-2}`}
          fill="#2d3748" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round"/>
        {/* Tile lines */}
        {([-7,-2,3,8] as number[]).map(dx => (
          <line key={dx} x1={cx+dx} y1={cy-14+Math.abs(dx)*0.2}
            x2={cx+dx*0.5} y2={cy-2} stroke="rgba(255,255,255,0.12)" strokeWidth={0.8}/>
        ))}
        {/* Stone wall */}
        <rect x={cx-11} y={cy-2} width={22} height={13} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Stone texture — mortar */}
        <line x1={cx-11} y1={cy+2}  x2={cx+11} y2={cy+2}  stroke={stroke} strokeWidth={0.4} opacity={0.38}/>
        <line x1={cx-11} y1={cy+6}  x2={cx+11} y2={cy+6}  stroke={stroke} strokeWidth={0.4} opacity={0.38}/>
        <line x1={cx-11} y1={cy+9}  x2={cx+11} y2={cy+9}  stroke={stroke} strokeWidth={0.4} opacity={0.38}/>
        <line x1={cx-5}  y1={cy-2}  x2={cx-5}  y2={cy+11} stroke={stroke} strokeWidth={0.4} opacity={0.25}/>
        <line x1={cx+3}  y1={cy+2}  x2={cx+3}  y2={cy+11} stroke={stroke} strokeWidth={0.4} opacity={0.25}/>
        {/* Arched window */}
        <path d={`M ${cx-10},${cy+6} L ${cx-10},${cy+1} Q ${cx-7},${cy-2} ${cx-4},${cy+1} L ${cx-4},${cy+6} Z`}
          fill="#7fb5cc" opacity={0.65}>
          <animate attributeName="opacity" values="0.65;0.3;0.65"
            dur={`${3+d}s`} repeatCount="indefinite"/>
        </path>
        {/* Door arch */}
        <path d={`M ${cx-2.5},${cy+11} L ${cx-2.5},${cy+5} Q ${cx+1},${cy+2} ${cx+4.5},${cy+5} L ${cx+4.5},${cy+11} Z`}
          fill="rgba(0,0,0,0.42)" stroke={stroke} strokeWidth={0.8}/>
      </g>
    );
  }

  if (skin === 'building_gold') {
    // Gold — Elegant villa
    return (
      <g opacity={opacity} style={{ pointerEvents: 'none' }}>
        {/* Ambient glow */}
        <circle cx={cx} cy={cy-5} r={16} fill="#fbbf24" opacity={0.07}>
          <animate attributeName="opacity" values="0.07;0.17;0.07"
            dur={`${2.2+d}s`} repeatCount="indefinite"/>
        </circle>
        {/* Ornate peaked roof */}
        <polygon points={`${cx},${cy-20} ${cx-13},${cy-3} ${cx+13},${cy-3}`}
          fill="#7c3a0e" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round"/>
        {/* Gold roof trim */}
        <polygon points={`${cx},${cy-20} ${cx-13},${cy-3} ${cx+13},${cy-3}`}
          fill="none" stroke="#fbbf24" strokeWidth={1.2} opacity={0.85}/>
        {/* Decorative gold trim band */}
        <rect x={cx-13} y={cy-4} width={26} height={2.5} fill="#fbbf24" opacity={0.7}/>
        {/* Finial spire */}
        <polygon points={`${cx},${cy-26} ${cx-2.5},${cy-20} ${cx+2.5},${cy-20}`}
          fill="#fbbf24" stroke="#f59e0b" strokeWidth={0.8}/>
        <circle cx={cx} cy={cy-26} r={2} fill="#fbbf24">
          <animate attributeName="opacity" values="1;0.4;1"
            dur={`${1.5+d}s`} repeatCount="indefinite"/>
        </circle>
        {/* Walls */}
        <rect x={cx-11} y={cy-1} width={22} height={12} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Gold pilasters */}
        <rect x={cx-11} y={cy-1} width={2.5} height={12} fill="#fbbf24" opacity={0.45}/>
        <rect x={cx+8.5} y={cy-1} width={2.5} height={12} fill="#fbbf24" opacity={0.45}/>
        {/* Ornate window with warm glow */}
        <path d={`M ${cx-9},${cy+6} L ${cx-9},${cy+1} Q ${cx-6},${cy-2} ${cx-3},${cy+1} L ${cx-3},${cy+6} Z`}
          fill="#fde68a" opacity={0.88}>
          <animate attributeName="opacity" values="0.88;0.5;0.88"
            dur={`${2+d}s`} repeatCount="indefinite"/>
        </path>
        {/* Grand arched door */}
        <path d={`M ${cx-2},${cy+11} L ${cx-2},${cy+5} Q ${cx+2},${cy+2} ${cx+6},${cy+5} L ${cx+6},${cy+11} Z`}
          fill="rgba(0,0,0,0.45)" stroke="#fbbf24" strokeWidth={1.1}/>
        <circle cx={cx+2} cy={cy+8} r={1.2} fill="#fbbf24" opacity={0.9}/>
      </g>
    );
  }

  // building_default — Rookie wooden hut
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none' }}>
      {/* Roof */}
      <polygon points={`${cx},${cy-14} ${cx-11},${cy-1} ${cx+11},${cy-1}`}
        fill={fill} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round"/>
      {/* Ridge */}
      <line x1={cx-7} y1={cy-5} x2={cx+7} y2={cy-5}
        stroke={stroke} strokeWidth={0.5} opacity={0.3}/>
      {/* Wall */}
      <rect x={cx-9} y={cy-1} width={18} height={11} fill={fill} stroke={stroke} strokeWidth={1.5}/>
      {/* Plank lines */}
      <line x1={cx-9} y1={cy+3} x2={cx+9} y2={cy+3} stroke={stroke} strokeWidth={0.5} opacity={0.28}/>
      <line x1={cx-9} y1={cy+6.5} x2={cx+9} y2={cy+6.5} stroke={stroke} strokeWidth={0.5} opacity={0.28}/>
      {/* Door */}
      <rect x={cx-3} y={cy+3} width={6} height={8} rx={0.5} fill="rgba(0,0,0,0.28)"/>
      {/* Window */}
      <rect x={cx-8} y={cy} width={4} height={3.5} rx={0.5} fill="rgba(255,255,200,0.38)">
        <animate attributeName="opacity" values="0.38;0.15;0.38"
          dur={`${3.2+d}s`} repeatCount="indefinite"/>
      </rect>
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
  cx, cy, fill, opacity = 1, stroke = 'white', skin = 'building_default',
}: { cx: number; cy: number; fill: string; opacity?: number; stroke?: string; skin?: string }) {
  const d = ((cx * 9 + cy * 5) % 25) / 10; // pseudo-random 0–2.5

  if (skin === 'building_iron') {
    // Bronze — Wooden palisade fort
    return (
      <g opacity={opacity} style={{ pointerEvents: 'none' }}>
        {/* Watchtower left */}
        <rect x={cx-18} y={cy-22} width={9} height={22} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Tower pointed roof */}
        <polygon points={`${cx-13.5},${cy-30} ${cx-20},${cy-22} ${cx-7},${cy-22}`}
          fill="#7c5a0a" stroke={stroke} strokeWidth={1.2}/>
        {/* Tower arrow slit */}
        <rect x={cx-16} y={cy-18} width={2.5} height={6} rx={0.5} fill="rgba(0,0,0,0.5)"/>
        {/* Tower window glow */}
        <rect x={cx-16} y={cy-11} width={4} height={3.5} fill="#fde68a" opacity={0.65}>
          <animate attributeName="opacity" values="0.65;0.3;0.65"
            dur={`${2.2+d}s`} repeatCount="indefinite"/>
        </rect>
        {/* Smoke from tower */}
        <circle cx={cx-13.5} cy={cy-33} r={2.2} fill="rgba(180,180,180,0.45)">
          <animate attributeName="cy" values={`${cy-33};${cy-40};${cy-33}`}
            dur={`${2.8+d}s`} repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.45;0.08;0.45"
            dur={`${2.8+d}s`} repeatCount="indefinite"/>
        </circle>
        {/* Palisade logs */}
        {[-6,-2,2,6,10].map(dx => (
          <rect key={dx} x={cx+dx-1.8} y={cy-24} width={3.5} height={9} rx={0.8}
            fill="#6b4a1a" stroke={stroke} strokeWidth={0.9}/>
        ))}
        {/* Main fort body */}
        <rect x={cx-9} y={cy-15} width={25} height={15} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Log texture */}
        <line x1={cx-9} y1={cy-11} x2={cx+16} y2={cy-11} stroke={stroke} strokeWidth={0.5} opacity={0.38}/>
        <line x1={cx-9} y1={cy-7}  x2={cx+16} y2={cy-7}  stroke={stroke} strokeWidth={0.5} opacity={0.38}/>
        {/* Gate with arch */}
        <path d={`M ${cx-1},${cy} L ${cx-1},${cy-9} Q ${cx+4},${cy-14} ${cx+9},${cy-9} L ${cx+9},${cy} Z`}
          fill="rgba(0,0,0,0.4)" stroke={stroke} strokeWidth={0.9}/>
      </g>
    );
  }

  if (skin === 'building_stone') {
    // Silver — Stone keep with flag
    return (
      <g opacity={opacity} style={{ pointerEvents: 'none' }}>
        {/* Main tower */}
        <rect x={cx-15} y={cy-23} width={13} height={23} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Tower battlements */}
        <rect x={cx-15} y={cy-27} width={3.5} height={5} fill={fill} stroke={stroke} strokeWidth={1}/>
        <rect x={cx-9}  y={cy-27} width={3.5} height={5} fill={fill} stroke={stroke} strokeWidth={1}/>
        <rect x={cx-3}  y={cy-27} width={3}   height={5} fill={fill} stroke={stroke} strokeWidth={1}/>
        {/* Arrow slits */}
        <rect x={cx-12} y={cy-19} width={2.5} height={6} fill="rgba(0,0,0,0.55)"/>
        <rect x={cx-7}  y={cy-13} width={2.5} height={5} fill="rgba(0,0,0,0.55)"/>
        {/* Stone texture */}
        {[-18,-13,-8,-3].map(dy => (
          <line key={dy} x1={cx-15} y1={cy+dy} x2={cx-2} y2={cy+dy}
            stroke={stroke} strokeWidth={0.45} opacity={0.32}/>
        ))}
        {/* Tower window */}
        <rect x={cx-13} y={cy-9} width={5} height={5} rx={0.8} fill="#7fb5cc" opacity={0.7}>
          <animate attributeName="opacity" values="0.7;0.35;0.7"
            dur={`${3.2+d}s`} repeatCount="indefinite"/>
        </rect>
        {/* Flag pole + waving flag */}
        <line x1={cx-9} y1={cy-27} x2={cx-9} y2={cy-37}
          stroke={stroke} strokeWidth={1.2} opacity={0.85}/>
        <polygon points={`${cx-9},${cy-37} ${cx-2},${cy-34} ${cx-9},${cy-31}`}
          fill={fill} stroke={stroke} strokeWidth={0.9}>
          <animateTransform attributeName="transform" type="rotate"
            values={`-6 ${cx-9} ${cy-34};6 ${cx-9} ${cy-34};-6 ${cx-9} ${cy-34}`}
            dur={`${2.1+d}s`} repeatCount="indefinite"/>
        </polygon>
        {/* Side hall */}
        <rect x={cx-2} y={cy-16} width={16} height={16} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Side hall battlements */}
        <rect x={cx-2}  y={cy-20} width={3.5} height={5} fill={fill} stroke={stroke} strokeWidth={1}/>
        <rect x={cx+4}  y={cy-20} width={3.5} height={5} fill={fill} stroke={stroke} strokeWidth={1}/>
        <rect x={cx+10} y={cy-20} width={3.5} height={5} fill={fill} stroke={stroke} strokeWidth={1}/>
        {/* Gate arch */}
        <path d={`M ${cx+1},${cy} L ${cx+1},${cy-9} Q ${cx+6},${cy-14} ${cx+11},${cy-9} L ${cx+11},${cy} Z`}
          fill="rgba(0,0,0,0.48)" stroke={stroke} strokeWidth={0.9}/>
      </g>
    );
  }

  if (skin === 'building_gold') {
    // Gold — Grand fortress with twin towers
    return (
      <g opacity={opacity} style={{ pointerEvents: 'none' }}>
        {/* Outer glow */}
        <ellipse cx={cx} cy={cy-10} rx={20} ry={18} fill="#fbbf24" opacity={0.07}>
          <animate attributeName="opacity" values="0.07;0.16;0.07"
            dur={`${2.4+d}s`} repeatCount="indefinite"/>
        </ellipse>
        {/* Left tower */}
        <rect x={cx-16} y={cy-26} width={13} height={26} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Left tower gold trim */}
        <line x1={cx-16} y1={cy-26} x2={cx-3} y2={cy-26} stroke="#fbbf24" strokeWidth={1.8} opacity={0.8}/>
        {/* Left tower ornate battlements */}
        {([-16,-11,-6] as number[]).map(dx => (
          <rect key={dx} x={cx+dx} y={cy-31} width={3.5} height={6}
            fill={fill} stroke="#fbbf24" strokeWidth={1}/>
        ))}
        {/* Left tower spire */}
        <polygon points={`${cx-9.5},${cy-40} ${cx-16},${cy-31} ${cx-3},${cy-31}`}
          fill="#7c3a0e" stroke="#fbbf24" strokeWidth={1.2}/>
        <polygon points={`${cx-9.5},${cy-46} ${cx-12},${cy-40} ${cx-7},${cy-40}`}
          fill="#fbbf24"/>
        {/* Left tower flag */}
        <line x1={cx-9.5} y1={cy-46} x2={cx-9.5} y2={cy-53}
          stroke="#fbbf24" strokeWidth={1.2}/>
        <polygon points={`${cx-9.5},${cy-53} ${cx-3},${cy-50} ${cx-9.5},${cy-47}`}
          fill="#fbbf24" opacity={0.95}>
          <animateTransform attributeName="transform" type="rotate"
            values={`-8 ${cx-9.5} ${cy-50};8 ${cx-9.5} ${cy-50};-8 ${cx-9.5} ${cy-50}`}
            dur={`${1.9+d}s`} repeatCount="indefinite"/>
        </polygon>
        {/* Left tower windows */}
        <rect x={cx-14} y={cy-22} width={4} height={5} rx={1} fill="#fde68a" opacity={0.85}>
          <animate attributeName="opacity" values="0.85;0.45;0.85"
            dur={`${2.1+d}s`} repeatCount="indefinite"/>
        </rect>
        <rect x={cx-14} y={cy-13} width={4} height={5} rx={1} fill="#fde68a" opacity={0.75}>
          <animate attributeName="opacity" values="0.75;0.35;0.75"
            dur={`${2.6+d}s`} begin={`${d*0.5}s`} repeatCount="indefinite"/>
        </rect>
        {/* Right hall */}
        <rect x={cx-3} y={cy-19} width={18} height={19} fill={fill} stroke={stroke} strokeWidth={1.5}/>
        {/* Right hall gold trim */}
        <line x1={cx-3} y1={cy-19} x2={cx+15} y2={cy-19} stroke="#fbbf24" strokeWidth={1.8} opacity={0.8}/>
        {/* Right hall battlements */}
        {([-3,3,9] as number[]).map(dx => (
          <rect key={dx} x={cx+dx} y={cy-24} width={3.5} height={6}
            fill={fill} stroke="#fbbf24" strokeWidth={1}/>
        ))}
        {/* Right hall window */}
        <rect x={cx} y={cy-15} width={5} height={6} rx={1} fill="#fde68a" opacity={0.8}>
          <animate attributeName="opacity" values="0.8;0.4;0.8"
            dur={`${2.8+d}s`} repeatCount="indefinite"/>
        </rect>
        {/* Grand gate with golden arch */}
        <path d={`M ${cx+3},${cy} L ${cx+3},${cy-10} Q ${cx+8},${cy-16} ${cx+13},${cy-10} L ${cx+13},${cy} Z`}
          fill="rgba(0,0,0,0.55)" stroke="#fbbf24" strokeWidth={1.3}/>
        {/* Door ornament */}
        <circle cx={cx+8} cy={cy-5} r={1.8} fill="#fbbf24" opacity={0.9}>
          <animate attributeName="opacity" values="0.9;0.45;0.9"
            dur={`${3+d}s`} repeatCount="indefinite"/>
        </circle>
      </g>
    );
  }

  // building_default — basic keep
  return (
    <g opacity={opacity} style={{ pointerEvents: 'none' }}>
      {/* tall left tower */}
      <rect x={cx - 13} y={cy - 18} width={11} height={18} fill={fill} stroke={stroke} strokeWidth={1.5}/>
      {/* battlements */}
      <rect x={cx - 13} y={cy - 22} width={3.5} height={4.5} fill={fill} stroke={stroke} strokeWidth={1}/>
      <rect x={cx - 7}  y={cy - 22} width={3.5} height={4.5} fill={fill} stroke={stroke} strokeWidth={1}/>
      {/* right wing */}
      <rect x={cx - 2} y={cy - 13} width={13} height={13} fill={fill} stroke={stroke} strokeWidth={1.5}/>
      {/* windows */}
      <rect x={cx - 11} y={cy - 14} width={3} height={4} rx={0.5} fill="rgba(255,255,200,0.32)">
        <animate attributeName="opacity" values="0.32;0.12;0.32" dur="3.5s" repeatCount="indefinite"/>
      </rect>
      <rect x={cx + 1} y={cy - 10} width={3} height={4} rx={0.5} fill="rgba(255,255,200,0.32)"/>
      {/* gate */}
      <rect x={cx - 1} y={cy - 7} width={5} height={7} fill="rgba(0,0,0,0.3)" stroke={stroke} strokeWidth={0.7}/>
    </g>
  );
}

// ─── Soldier helmet (board inline) ───────────────────────────────────────────
/**
 * Draws a single soldier helmet centered at (cx, cy) inside an existing SVG.
 * Size ~10×10 units in SVG space.
 */
export function SoldierHelmetSvg({ cx, cy, size = 10 }: { cx: number; cy: number; size?: number }) {
  const s = size / 10;
  return (
    <g transform={`translate(${cx},${cy})`} style={{ pointerEvents: 'none' }}>
      {/* Dome */}
      <path
        d={`M${-4.5*s},${1*s} Q${-4.5*s},${-5*s} 0,${-5.5*s} Q${4.5*s},${-5*s} ${4.5*s},${1*s} Z`}
        fill="#fbbf24" stroke="#92400e" strokeWidth={0.8*s}
      />
      {/* Brim */}
      <rect x={-5.5*s} y={0.5*s} width={11*s} height={2*s} rx={1*s}
        fill="#f59e0b" stroke="#92400e" strokeWidth={0.8*s}/>
      {/* Visor slit */}
      <rect x={-2.5*s} y={-1.5*s} width={5*s} height={1.2*s} rx={0.5*s}
        fill="rgba(0,0,0,0.5)"/>
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
