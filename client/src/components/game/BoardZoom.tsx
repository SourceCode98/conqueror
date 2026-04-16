/**
 * Wraps the hex board with pinch-to-zoom, mouse-wheel zoom, and pointer drag pan.
 * Also provides a fullscreen toggle button.
 */
import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const ZOOM_SENSITIVITY = 0.0008;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export default function BoardZoom({ children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs for imperative pointer/touch state (avoids stale closures)
  const stateRef = useRef({ scale: 1, offset: { x: 0, y: 0 } });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const applyState = useCallback((s: number, o: { x: number; y: number }) => {
    stateRef.current = { scale: s, offset: o };
    setScale(s);
    setOffset(o);
  }, []);

  const resetView = useCallback(() => applyState(1, { x: 0, y: 0 }), [applyState]);

  // ── Wheel zoom (desktop) ───────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { scale: s, offset: o } = stateRef.current;
      const rect = el.getBoundingClientRect();
      // Zoom toward cursor position
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      const newScale = clamp(s * (1 + delta), MIN_SCALE, MAX_SCALE);
      const ratio = newScale / s;
      const nx = cx - (cx - o.x) * ratio;
      const ny = cy - (cy - o.y) * ratio;
      applyState(newScale, { x: nx, y: ny });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyState]);

  // ── Pointer events (drag pan + pinch zoom) ────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle middle-click or two-finger for pan — let board SVG handle primary click
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2) {
      // Start pinch
      const pts = [...activePointers.current.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      pinchRef.current = { dist, cx, cy };
      dragRef.current = null;
    } else if (e.button === 1 || e.button === 2) {
      // Middle or right click drag
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, ox: stateRef.current.offset.x, oy: stateRef.current.offset.y };
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2 && pinchRef.current) {
      const el = containerRef.current;
      if (!el) return;
      const pts = [...activePointers.current.values()];
      const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const { scale: s, offset: o } = stateRef.current;
      const rect = el.getBoundingClientRect();
      const ratio = newDist / pinchRef.current.dist;
      const newScale = clamp(s * ratio, MIN_SCALE, MAX_SCALE);
      const realRatio = newScale / s;
      const cx = pinchRef.current.cx - rect.left;
      const cy = pinchRef.current.cy - rect.top;
      const nx = cx - (cx - o.x) * realRatio;
      const ny = cy - (cy - o.y) * realRatio;
      pinchRef.current = { dist: newDist, cx: pinchRef.current.cx, cy: pinchRef.current.cy };
      applyState(newScale, { x: nx, y: ny });
      return;
    }

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      applyState(stateRef.current.scale, { x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
    }
  }, [applyState]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchRef.current = null;
    if (activePointers.current.size === 0) dragRef.current = null;
  }, []);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current?.closest('[data-board-root]') as HTMLElement | null;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Transformed board */}
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          width: '100%',
          height: '100%',
          willChange: 'transform',
        }}
      >
        {children}
      </div>

      {/* Controls — bottom-right corner */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10 pointer-events-auto">
        <button
          onClick={() => {
            const { scale: s, offset: o } = stateRef.current;
            const el = containerRef.current;
            if (!el) return;
            const newScale = clamp(s * 1.25, MIN_SCALE, MAX_SCALE);
            const cx = el.clientWidth / 2;
            const cy = el.clientHeight / 2;
            const ratio = newScale / s;
            applyState(newScale, { x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio });
          }}
          title="Zoom in"
          className="w-7 h-7 rounded-lg bg-gray-800/90 border border-gray-600 text-gray-200 text-sm font-bold hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center"
        >+</button>
        <button
          onClick={() => {
            const { scale: s, offset: o } = stateRef.current;
            const el = containerRef.current;
            if (!el) return;
            const newScale = clamp(s / 1.25, MIN_SCALE, MAX_SCALE);
            const cx = el.clientWidth / 2;
            const cy = el.clientHeight / 2;
            const ratio = newScale / s;
            applyState(newScale, { x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio });
          }}
          title="Zoom out"
          className="w-7 h-7 rounded-lg bg-gray-800/90 border border-gray-600 text-gray-200 text-sm font-bold hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center"
        >−</button>
        <button
          onClick={resetView}
          title="Reset view"
          className="w-7 h-7 rounded-lg bg-gray-800/90 border border-gray-600 text-gray-400 text-xs hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center"
        >⊙</button>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="w-7 h-7 rounded-lg bg-gray-800/90 border border-gray-600 text-gray-400 text-xs hover:bg-gray-700 active:scale-95 transition-all flex items-center justify-center"
        >{isFullscreen ? '⛶' : '⛶'}</button>
      </div>

      {/* Scale indicator — fades after idle */}
      {scale !== 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/50 text-gray-400 text-[10px] pointer-events-none select-none">
          {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}
