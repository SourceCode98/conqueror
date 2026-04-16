/**
 * Wraps the hex board with pinch-to-zoom, mouse-wheel zoom, and single/multi-finger drag pan.
 * Fullscreen targets the nearest [data-game-root] ancestor (whole game view).
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

  // Imperative refs — no stale closures
  const stateRef = useRef({ scale: 1, offset: { x: 0, y: 0 } });
  // Single-finger drag (only activates after moving > threshold)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number; active: boolean } | null>(null);
  // Pinch
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const DRAG_THRESHOLD = 8; // px — below this a touch is still a tap

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
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const delta = -e.deltaY * ZOOM_SENSITIVITY;
      const newScale = clamp(s * (1 + delta), MIN_SCALE, MAX_SCALE);
      const ratio = newScale / s;
      applyState(newScale, { x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyState]);

  // ── Pointer events — registered imperatively so we can use setPointerCapture ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.current.size === 2) {
        // Start pinch — cancel any drag
        dragRef.current = null;
        const pts = [...activePointers.current.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        pinchRef.current = { dist, midX, midY };
      } else if (activePointers.current.size === 1) {
        // Single finger / primary click — arm drag, activate only after threshold
        pinchRef.current = null;
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          ox: stateRef.current.offset.x,
          oy: stateRef.current.offset.y,
          active: false,
        };
      }
    };

    const onMove = (e: PointerEvent) => {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const container = containerRef.current;
      if (!container) return;

      if (activePointers.current.size >= 2 && pinchRef.current) {
        const pts = [...activePointers.current.values()];
        const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const { scale: s, offset: o } = stateRef.current;
        const rect = container.getBoundingClientRect();
        const ratio = newDist / pinchRef.current.dist;
        const newScale = clamp(s * ratio, MIN_SCALE, MAX_SCALE);
        const realRatio = newScale / s;
        const cx = pinchRef.current.midX - rect.left;
        const cy = pinchRef.current.midY - rect.top;
        pinchRef.current = { dist: newDist, midX: pinchRef.current.midX, midY: pinchRef.current.midY };
        applyState(newScale, { x: cx - (cx - o.x) * realRatio, y: cy - (cy - o.y) * realRatio });
        return;
      }

      if (dragRef.current && activePointers.current.size === 1) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (!dragRef.current.active) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          dragRef.current.active = true;
          el.setPointerCapture(e.pointerId);
        }
        applyState(stateRef.current.scale, { x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
      }
    };

    const onUp = (e: PointerEvent) => {
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size < 2) pinchRef.current = null;
      if (activePointers.current.size === 0) dragRef.current = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [applyState]);

  // ── Fullscreen (targets entire game root, so controls remain visible) ───────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current?.closest('[data-game-root]') as HTMLElement | null
            ?? containerRef.current?.closest('[data-board-root]') as HTMLElement | null;
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
      style={{ touchAction: 'none' }}
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
          pointerEvents: 'none',
        }}
      >
        {/* Re-enable pointer events for board children */}
        <div style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}>
          {children}
        </div>
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

      {/* Scale indicator */}
      {scale !== 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/50 text-gray-400 text-[10px] pointer-events-none select-none">
          {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}
