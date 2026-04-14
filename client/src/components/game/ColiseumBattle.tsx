import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const ARENA_RADIUS  = 11;
const MOVE_SPEED    = 5.5;
const POS_SEND_MS   = 50;   // 20 fps position sync
const ATTACK_ANIM_MS = 280;
const WIN_SCORE     = 3;
const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window);

// ─── Arena builder ────────────────────────────────────────────────────────────
function buildArena(scene: THREE.Scene) {
  // Sand floor
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 0.28, 48),
    new THREE.MeshStandardMaterial({ color: 0xc8a870, roughness: 0.95 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);

  // Edge ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_RADIUS, 0.38, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x6b5230, roughness: 0.85 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.17;
  scene.add(ring);

  // Pillars + torches
  for (let i = 0; i < 8; i++) {
    const a  = (i / 8) * Math.PI * 2;
    const px = Math.sin(a) * (ARENA_RADIUS - 0.8);
    const pz = Math.cos(a) * (ARENA_RADIUS - 0.8);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.5, 4.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x7a6545, roughness: 0.85 }),
    );
    pillar.position.set(px, 2.3, pz);
    pillar.castShadow = true;
    scene.add(pillar);

    // Flame light
    const torch = new THREE.PointLight(0xff7200, 1.8, 10);
    torch.position.set(px * 0.92, 5.6, pz * 0.92);
    scene.add(torch);

    // Small flame sphere
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9900 }),
    );
    flame.position.copy(torch.position);
    scene.add(flame);
  }

  // Center mark
  const mark = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.01, 16),
    new THREE.MeshStandardMaterial({ color: 0xa07030, metalness: 0.5 }),
  );
  mark.position.y = 0.15;
  scene.add(mark);
}

// ─── Player mesh ──────────────────────────────────────────────────────────────
function buildPlayerMesh(hexColor: string): THREE.Group {
  const col    = new THREE.Color(hexColor);
  const body   = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
  const skin   = new THREE.MeshStandardMaterial({ color: 0xf0c080, roughness: 0.7 });
  const metal  = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.85, roughness: 0.2 });
  const wood   = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });

  const g = new THREE.Group();

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.75, 7);
  // Legs are pivot-groups so we can rotate them at the hip
  const legLPivot = new THREE.Group(); legLPivot.position.set(-0.14, 0.75, 0); g.add(legLPivot);
  const legRPivot = new THREE.Group(); legRPivot.position.set( 0.14, 0.75, 0); g.add(legRPivot);
  const legLMesh = new THREE.Mesh(legGeo, body); legLMesh.position.set(0, -0.375, 0); legLPivot.add(legLMesh);
  const legRMesh = new THREE.Mesh(legGeo, body); legRMesh.position.set(0, -0.375, 0); legRPivot.add(legRMesh);
  g.userData.legL = legLPivot;
  g.userData.legR = legRPivot;

  // Torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.9, 8), body);
  torso.position.y = 1.05;
  g.add(torso);

  // Head + helmet
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 10), skin);
  head.position.y = 1.65; g.add(head);

  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    metal,
  );
  helm.position.y = 1.65; g.add(helm);

  // ── Sword (right side) ──
  const swGrp = new THREE.Group();
  swGrp.position.set(0.44, 1.05, 0.15);
  swGrp.rotation.z = -0.18;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.95, 0.04), metal);
  blade.position.y = 0.47;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.065, 0.065), metal);
  const hilt  = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), wood);
  hilt.position.y = -0.11;
  swGrp.add(blade, guard, hilt);
  g.add(swGrp);
  g.userData.sword       = swGrp;
  g.userData.swordRestZ  = 0.15;

  // ── Shield (left side, hidden when not blocking) ──
  const shGrp = new THREE.Group();
  shGrp.position.set(-0.44, 1.1, 0.22);
  const shBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.09), new THREE.MeshStandardMaterial({ color: col, metalness: 0.25, roughness: 0.6 }));
  const shRim  = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.69, 0.06), metal);
  shRim.position.z = 0.025;
  const shBoss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), metal);
  shGrp.add(shBody, shRim, shBoss);
  shGrp.visible = false;
  g.add(shGrp);
  g.userData.shield = shGrp;

  // ── Hit flash (red glow sphere, normally invisible) ──
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0, depthWrite: false }),
  );
  flash.position.y = 1.0;
  g.add(flash);
  g.userData.flash = flash;

  return g;
}

// ─── Virtual joystick UI ──────────────────────────────────────────────────────
interface JoyState { cx: number; cy: number; dx: number; dy: number; active: boolean }

function VJoy({ joyRef, side }: { joyRef: React.MutableRefObject<JoyState>; side: 'left' | 'right' }) {
  const BASE = 52;
  const KNOB = 22;
  const j = joyRef.current;
  const kx = j.active ? Math.max(-BASE + KNOB, Math.min(BASE - KNOB, j.dx)) : 0;
  const ky = j.active ? Math.max(-BASE + KNOB, Math.min(BASE - KNOB, j.dy)) : 0;

  return (
    <div
      className={`absolute bottom-8 ${side === 'left' ? 'left-8' : 'right-8'} pointer-events-none`}
      style={{ width: BASE * 2, height: BASE * 2 }}
    >
      {/* Base */}
      <div
        className="absolute inset-0 rounded-full border-2 border-white/20"
        style={{ background: 'rgba(255,255,255,0.07)' }}
      />
      {/* Knob */}
      <div
        className="absolute rounded-full border border-white/40"
        style={{
          width: KNOB * 2, height: KNOB * 2,
          left: BASE - KNOB + kx, top: BASE - KNOB + ky,
          background: 'rgba(255,255,255,0.18)',
          transition: j.active ? 'none' : 'left 0.1s, top 0.1s',
        }}
      />
    </div>
  );
}

const MAX_HP = 100;

// ─── HP bar ────────────────────────────────────────────────────────────────────
function HpBar({ hp, maxHp, color, flipped }: { hp: number; maxHp: number; color: string; flipped?: boolean }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const barColor = pct > 50 ? color : pct > 25 ? '#facc15' : '#ef4444';
  return (
    <div className="flex flex-col gap-0.5 w-24">
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 6px ${barColor}80`, ...(flipped ? { marginLeft: 'auto' } : {}) }}
        />
      </div>
    </div>
  );
}

// ─── Round dots ────────────────────────────────────────────────────────────────
function RoundDots({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: WIN_SCORE }).map((_, i) => (
        <div
          key={i}
          className="w-2.5 h-2.5 rounded-full border transition-all duration-200"
          style={{
            backgroundColor: i < score ? color : 'transparent',
            borderColor: color,
            boxShadow: i < score ? `0 0 5px ${color}` : 'none',
          }}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ColiseumBattle() {
  const mountRef     = useRef<HTMLDivElement>(null);
  const gameState    = useGameStore(s => s.gameState);
  const localId      = useGameStore(s => s.localPlayerId);
  const hitEventStore = useGameStore(s => s.coliseumHitEvent);
  const battleOver   = useGameStore(s => s.coliseumBattleOver);
  const clearBattleOver = useGameStore(s => s.clearColiseumBattleOver);

  const [scores, setScores]           = useState({ attacker: 0, defender: 0, attackerHp: MAX_HP, defenderHp: MAX_HP, defenderMaxHp: MAX_HP });
  const [hitNotice, setHitNotice]     = useState<{ label: string; color: string } | null>(null);
  const isPortrait = () => {
    if (typeof screen !== 'undefined' && screen.orientation?.type) {
      return screen.orientation.type.includes('portrait');
    }
    return window.innerHeight > window.innerWidth;
  };
  const [portrait, setPortrait]       = useState(isPortrait);
  const [showControls, setShowControls] = useState(true);

  const battle        = gameState?.coliseumBattle;
  const isActive      = gameState?.phase === 'COLISEUM_BATTLE' && !!battle;

  // Set defenderMaxHp once when battle starts (first time we see the battle state)
  useEffect(() => {
    if (battle) setScores(prev => ({
      ...prev,
      attacker: battle.attackerScore,
      defender: battle.defenderScore,
      attackerHp: battle.attackerHp,
      defenderHp: battle.defenderHp,
      // defenderMaxHp is the starting HP for the round — capture it from the initial full-HP value
      defenderMaxHp: battle.attackerScore === 0 && battle.defenderScore === 0 && prev.defenderMaxHp === MAX_HP
        ? battle.defenderHp  // initial battle start
        : prev.defenderMaxHp,
    }));
  }, [battle?.attackerScore, battle?.defenderScore, battle?.attackerHp, battle?.defenderHp]);
  const mobile        = isMobileDevice();

  // Live refs used inside the Three.js loop (no re-render needed)
  const joyMove   = useRef<JoyState>({ cx: 0, cy: 0, dx: 0, dy: 0, active: false });
  const joyLook   = useRef<JoyState>({ cx: 0, cy: 0, dx: 0, dy: 0, active: false });
  const shielding = useRef(false);
  const localPosRef = useRef({ x: 0, z: 0 });
  const yawRef    = useRef(0);
  // Re-render joystick every frame on mobile
  const [, forceJoy] = useState(0);

  // Orientation — use small delay after orientationchange so dimensions have updated
  useEffect(() => {
    const check = () => setTimeout(() => setPortrait(isPortrait()), 80);
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
  }, []);

  // Hide controls hint after 5s
  useEffect(() => {
    if (!isActive) return;
    setShowControls(true);
    const t = setTimeout(() => setShowControls(false), 5000);
    return () => clearTimeout(t);
  }, [isActive]);

  // Hit event → score + HP update + notice
  useEffect(() => {
    if (!hitEventStore || !battle) return;
    setScores(prev => ({ ...prev, attacker: hitEventStore.attackerScore, defender: hitEventStore.defenderScore, attackerHp: hitEventStore.attackerHp, defenderHp: hitEventStore.defenderHp }));
    const isLocalHit = hitEventStore.defenderId === localId;
    if (hitEventStore.blocked) {
      setHitNotice({ label: '🛡️ BLOCKED!', color: '#60a5fa' });
    } else {
      setHitNotice({ label: isLocalHit ? '💥 HIT!  —' : '⚔️ HIT!', color: isLocalHit ? '#f87171' : '#fbbf24' });
    }
    const t = setTimeout(() => setHitNotice(null), 1100);
    return () => clearTimeout(t);
  }, [hitEventStore]);

  // Auto-dismiss battle over
  useEffect(() => {
    if (!battleOver) return;
    const t = setTimeout(() => clearBattleOver(), 4000);
    return () => clearTimeout(t);
  }, [battleOver]);

  // ── Three.js game ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !mountRef.current || !battle) return;
    if (mobile && portrait) return; // wait for landscape

    const container = mountRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0704);
    scene.fog = new THREE.FogExp2(0x120804, 0.032);

    // Camera
    const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 80);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffd090, 0.3));
    const sun = new THREE.DirectionalLight(0xffe8b0, 0.85);
    sun.position.set(5, 14, 7);
    if (!mobile) { sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); }
    scene.add(sun);

    buildArena(scene);

    // Players
    const attackerPlayer = gameState?.players.find(p => p.id === battle.attackerId);
    const defenderPlayer = gameState?.players.find(p => p.id === battle.defenderId);
    const atkColor = attackerPlayer ? resolvePlayerColor(attackerPlayer.color) : '#ef4444';
    const defColor = defenderPlayer ? resolvePlayerColor(defenderPlayer.color) : '#3b82f6';

    const isLocalAttacker = localId === battle.attackerId;
    const isLocalDefender = localId === battle.defenderId;
    const isCombatant = isLocalAttacker || isLocalDefender;

    const localColor  = isLocalAttacker ? atkColor : defColor;
    const remoteColor = isLocalAttacker ? defColor : atkColor;

    const startX = isLocalAttacker ? -3.5 : 3.5;
    const startYaw = isLocalAttacker ? Math.PI / 2 : -Math.PI / 2; // face opponent

    localPosRef.current = { x: startX, z: 0 };
    yawRef.current = startYaw;

    const localMesh  = buildPlayerMesh(localColor);
    localMesh.position.set(startX, 0, 0);
    localMesh.rotation.y = startYaw;
    scene.add(localMesh);

    const remoteMesh = buildPlayerMesh(remoteColor);
    remoteMesh.position.set(-startX, 0, 0);
    remoteMesh.rotation.y = -startYaw;
    scene.add(remoteMesh);

    // Remote state (updated from WS without triggering re-renders)
    const remote = { x: -startX, z: 0, rotation: -startYaw, shielding: false, swinging: false };
    let remotePrevSwinging = false;

    // Controls state
    const keys = new Set<string>();
    let lastSend = 0;
    let lastAttack = 0;
    let swordSwing = false;
    let walkPhase = 0;       // walk cycle accumulator
    let remoteWalkPhase = 0; // for remote player

    // ── Expose attack + shield to React buttons ──
    function doAttack() {
      const now = performance.now();
      if (now - lastAttack < 950) return;
      lastAttack = now;
      if (swordSwing) return;
      swordSwing = true;
      const sw = localMesh.userData.sword as THREE.Group;
      sw.rotation.x = -1.1;
      sw.position.z = 0.55;
      setTimeout(() => { sw.rotation.x = 0; sw.position.z = localMesh.userData.swordRestZ; swordSwing = false; }, ATTACK_ANIM_MS);
      wsService.send({ type: 'COLISEUM_ATTACK', payload: { gameId: gameState!.gameId } });
    }

    // Attach to DOM node so React buttons can call them
    (container as any).__attack    = doAttack;
    (container as any).__shieldOn  = () => { shielding.current = true; };
    (container as any).__shieldOff = () => { shielding.current = false; };

    // ── WS subscription ──
    let remoteStatesRef = useGameStore.getState().coliseumPlayerStates;
    const unsubWs = wsService.onMessage(msg => {
      if (msg.type === 'COLISEUM_PLAYER_STATES') {
        const remoteId = isLocalAttacker ? battle.defenderId : battle.attackerId;
        const rs = msg.payload.states[remoteId];
        if (rs) { remote.x = rs.x; remote.z = rs.z; remote.rotation = rs.rotation; remote.shielding = rs.shielding; remote.swinging = rs.swinging; }
      }
      if (msg.type === 'COLISEUM_HIT') {
        // Flash the hit target mesh
        const isLocalHit = msg.payload.defenderId === localId;
        const flashMesh = isLocalHit ? localMesh : remoteMesh;
        const fl = flashMesh.userData.flash as THREE.Mesh;
        (fl.material as THREE.MeshBasicMaterial).opacity = 0.65;
        setTimeout(() => { (fl.material as THREE.MeshBasicMaterial).opacity = 0; }, 300);
        if (!msg.payload.blocked) shakeAmt = 0.22;
      }
    });

    // ── Keyboard ──
    const onKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling while game is active
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      keys.add(e.code);
      if (e.code === 'KeyF' || e.code === 'Space') doAttack();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') shielding.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') shielding.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Mouse look (pointer lock) ──
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { if (!document.pointerLockElement) renderer.domElement.requestPointerLock(); doAttack(); }
      if (e.button === 2) shielding.current = true;
    };
    const onMouseUp = (e: MouseEvent) => { if (e.button === 2) shielding.current = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === renderer.domElement) yawRef.current += e.movementX * 0.0028;
    };
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    // ── Touch / virtual joystick ──
    const touchIds = new Map<number, 'move' | 'look'>();
    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const relX = t.clientX / W;
        if (relX < 0.45 && !joyMove.current.active) {
          joyMove.current = { active: true, cx: t.clientX, cy: t.clientY, dx: 0, dy: 0 };
          touchIds.set(t.identifier, 'move');
        } else if (relX >= 0.45 && !joyLook.current.active) {
          joyLook.current = { active: true, cx: t.clientX, cy: t.clientY, dx: 0, dy: 0 };
          touchIds.set(t.identifier, 'look');
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const kind = touchIds.get(t.identifier);
        if (kind === 'move') {
          joyMove.current.dx = (t.clientX - joyMove.current.cx);
          joyMove.current.dy = (t.clientY - joyMove.current.cy);
        } else if (kind === 'look') {
          const ddx = t.clientX - joyLook.current.cx;
          yawRef.current += ddx * 0.003;
          joyLook.current.cx = t.clientX;
          joyLook.current.cy = t.clientY;
          joyLook.current.dx = 0; joyLook.current.dy = 0;
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const kind = touchIds.get(t.identifier);
        if (kind === 'move') joyMove.current = { active: false, cx: 0, cy: 0, dx: 0, dy: 0 };
        if (kind === 'look') joyLook.current = { active: false, cx: 0, cy: 0, dx: 0, dy: 0 };
        touchIds.delete(t.identifier);
      }
    };
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: true });

    // ── Resize ──
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Game loop ──
    let animId = 0;
    let lastT  = performance.now();
    let shakeAmt = 0;

    const tick = () => {
      animId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt  = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;

      let mx = 0, mz = 0; // movement input (used for leg anim outside combatant block)

      if (!isCombatant) {
        // Spectator: free rotating camera around arena centre
        yawRef.current += dt * 0.18;
        camera.position.set(
          Math.sin(yawRef.current) * 14,
          5.5,
          Math.cos(yawRef.current) * 14,
        );
        camera.lookAt(0, 1.4, 0);
      } else {
        // ── Input ──
        const DEAD = 8;
        if (mobile) {
          const jm = joyMove.current;
          if (Math.abs(jm.dx) > DEAD) mx = Math.max(-1, Math.min(1, jm.dx / 55));
          if (Math.abs(jm.dy) > DEAD) mz = Math.max(-1, Math.min(1, jm.dy / -55));
        } else {
          if (keys.has('KeyW') || keys.has('ArrowUp'))    mz =  1;
          if (keys.has('KeyS') || keys.has('ArrowDown'))  mz = -1;
          if (keys.has('KeyA') || keys.has('ArrowLeft'))  mx = -1;
          if (keys.has('KeyD') || keys.has('ArrowRight')) mx =  1;
        }

        // ── Movement (relative to camera yaw) ──
        const y    = yawRef.current;
        const spd  = MOVE_SPEED * dt;
        const fwdX = Math.sin(y), fwdZ = Math.cos(y);
        const rgtX = -Math.cos(y), rgtZ = Math.sin(y);
        const p = localPosRef.current;
        p.x += (fwdX * mz + rgtX * mx) * spd;
        p.z += (fwdZ * mz + rgtZ * mx) * spd;

        // Circular arena boundary
        const r = Math.sqrt(p.x * p.x + p.z * p.z);
        if (r > ARENA_RADIUS - 0.8) { const s = (ARENA_RADIUS - 0.8) / r; p.x *= s; p.z *= s; }

        // Player faces yaw
        localMesh.position.set(p.x, 0, p.z);
        localMesh.rotation.y = y;
        localMesh.userData.shield.visible = shielding.current;

        // ── Camera shake ──
        shakeAmt = Math.max(0, shakeAmt - dt * 4);
        const sx = (Math.random() - 0.5) * shakeAmt;
        const sy = (Math.random() - 0.5) * shakeAmt;

        // ── Third-person camera ──
        const CDIST = 5.5, CHEIGHT = 2.7;
        camera.position.set(
          p.x - Math.sin(y) * CDIST + sx,
          CHEIGHT + sy,
          p.z - Math.cos(y) * CDIST,
        );
        camera.lookAt(p.x, 1.3, p.z);

        // ── Send position update ──
        if (now - lastSend > POS_SEND_MS) {
          lastSend = now;
          wsService.send({
            type: 'COLISEUM_PLAYER_UPDATE',
            payload: { gameId: gameState!.gameId, x: p.x, z: p.z, rotation: y, shielding: shielding.current, swinging: swordSwing },
          });
        }
      }

      // ── Remote mesh ──
      remoteMesh.position.set(remote.x, 0, remote.z);
      remoteMesh.rotation.y = remote.rotation;
      (remoteMesh.userData.shield as THREE.Group).visible = remote.shielding;

      // Remote sword swing: trigger once on rising edge of swinging flag
      if (remote.swinging && !remotePrevSwinging) {
        const rsw = remoteMesh.userData.sword as THREE.Group;
        rsw.rotation.x = -1.1;
        rsw.position.z = 0.55;
        setTimeout(() => { rsw.rotation.x = 0; rsw.position.z = remoteMesh.userData.swordRestZ; }, ATTACK_ANIM_MS);
      }
      remotePrevSwinging = remote.swinging;

      // ── Leg animation (local) ──
      if (isCombatant) {
        const isMoving = Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05;
        const lL = localMesh.userData.legL as THREE.Group;
        const lR = localMesh.userData.legR as THREE.Group;
        if (swordSwing) {
          // Attack pose: legs spread apart slightly
          lL.rotation.x = -0.35;
          lR.rotation.x =  0.35;
        } else if (shielding.current) {
          // Shield stance: crouch forward
          lL.rotation.x = 0.3;
          lR.rotation.x = 0.3;
        } else if (isMoving) {
          walkPhase += dt * 8.5;
          lL.rotation.x =  Math.sin(walkPhase) * 0.55;
          lR.rotation.x = -Math.sin(walkPhase) * 0.55;
        } else {
          // Idle: return to neutral
          lL.rotation.x *= 0.82;
          lR.rotation.x *= 0.82;
        }
      }

      // ── Leg animation (remote) ──
      {
        const rlL = remoteMesh.userData.legL as THREE.Group;
        const rlR = remoteMesh.userData.legR as THREE.Group;
        // Approximate motion from position delta (we don't have exact velocity)
        remoteWalkPhase += dt * 7;
        const remoteMoving = Math.abs(remote.x - remoteMesh.position.x) > 0.005 || Math.abs(remote.z - remoteMesh.position.z) > 0.005;
        if (remote.shielding) {
          rlL.rotation.x = 0.3; rlR.rotation.x = 0.3;
        } else if (remoteMoving) {
          rlL.rotation.x =  Math.sin(remoteWalkPhase) * 0.55;
          rlR.rotation.x = -Math.sin(remoteWalkPhase) * 0.55;
        } else {
          rlL.rotation.x *= 0.82; rlR.rotation.x *= 0.82;
        }
      }

      // Refresh joystick visuals at ~30fps
      if (mobile && Math.floor(now / 33) !== Math.floor(lastT / 33)) forceJoy(n => n + 1);

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
      unsubWs();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [isActive, mobile && portrait]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mobile portrait show the rotate prompt as soon as a battle is active
  if (mobile && portrait && isActive && !battleOver) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-7xl" style={{ animation: 'spin 2s linear infinite' }}>📱</div>
        <p className="text-white text-2xl font-black">Rotate to Landscape</p>
        <p className="text-gray-400 text-sm">The coliseum battle requires landscape orientation</p>
        <div className="text-amber-400 text-4xl mt-2">⚔️</div>
      </div>
    );
  }

  if (!isActive && !battleOver) return null;

  const attackerPlayer = gameState?.players.find(p => p.id === battle?.attackerId);
  const defenderPlayer = gameState?.players.find(p => p.id === battle?.defenderId);
  const atkColor = attackerPlayer ? resolvePlayerColor(attackerPlayer.color) : '#ef4444';
  const defColor = defenderPlayer ? resolvePlayerColor(defenderPlayer.color) : '#3b82f6';
  const localIsAttacker = localId === battle?.attackerId;
  const isCombatant = localId === battle?.attackerId || localId === battle?.defenderId;

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      {/* Three.js canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* ── HUD overlay (React, on top of canvas) ── */}
      <div className="absolute inset-0 pointer-events-none flex flex-col">

        {/* Top: HP bars + round dots */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1 gap-2">
          {/* Attacker side */}
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className="text-xs font-bold truncate max-w-[90px]" style={{ color: atkColor }}>
              {attackerPlayer?.username ?? '?'}
            </span>
            <HpBar hp={scores.attackerHp} maxHp={MAX_HP} color={atkColor} />
            <RoundDots score={scores.attacker} color={atkColor} />
          </div>

          <div className="rounded-lg px-3 py-0.5 text-xs font-black text-amber-400 border border-amber-600/40 shrink-0"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
            ⚔️ COLISEUM
          </div>

          {/* Defender side */}
          <div className="flex flex-col items-end gap-0.5 min-w-0">
            <span className="text-xs font-bold truncate max-w-[90px] text-right" style={{ color: defColor }}>
              {defenderPlayer?.username ?? '?'}
            </span>
            <HpBar hp={scores.defenderHp} maxHp={scores.defenderMaxHp} color={defColor} flipped />
            <div className="flex items-center justify-end gap-1">
              {scores.defenderMaxHp > MAX_HP && (
                <span className="text-[9px] text-yellow-400/80 font-bold">🛡️×{Math.round((scores.defenderMaxHp - MAX_HP) / 30)}</span>
              )}
              <RoundDots score={scores.defender} color={defColor} />
            </div>
          </div>
        </div>

        {/* Centre: hit notice */}
        <div className="flex-1 flex items-start justify-center pt-16">
          <AnimatePresence>
            {hitNotice && (
              <motion.div
                key={hitNotice.label}
                initial={{ opacity: 0, y: -10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                transition={{ duration: 0.15 }}
                className="rounded-xl px-5 py-2 text-lg font-black"
                style={{ background: `${hitNotice.color}22`, color: hitNotice.color, border: `1px solid ${hitNotice.color}60`, backdropFilter: 'blur(4px)' }}
              >
                {hitNotice.label}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls hint (desktop, auto-hides after 5s) */}
        <AnimatePresence>
          {!mobile && isCombatant && showControls && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.35 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 select-none"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="rounded-2xl px-6 py-3 flex flex-col items-center gap-2"
                style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}
              >
                <p className="text-amber-400 text-xs font-black tracking-widest uppercase">Controls</p>
                <div className="flex gap-6 text-xs text-gray-300">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex gap-0.5">
                      <kbd className="bg-gray-700 rounded px-1.5 py-0.5 text-[10px] font-mono">W</kbd>
                    </div>
                    <div className="flex gap-0.5">
                      <kbd className="bg-gray-700 rounded px-1.5 py-0.5 text-[10px] font-mono">A</kbd>
                      <kbd className="bg-gray-700 rounded px-1.5 py-0.5 text-[10px] font-mono">S</kbd>
                      <kbd className="bg-gray-700 rounded px-1.5 py-0.5 text-[10px] font-mono">D</kbd>
                    </div>
                    <span className="text-gray-500 text-[10px]">Move</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-lg">🖱️</div>
                    <span className="text-gray-500 text-[10px]">Look</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex gap-1">
                      <kbd className="bg-red-900/70 rounded px-1.5 py-0.5 text-[10px] font-mono">F</kbd>
                      <span className="text-gray-500 text-[10px]">or LMB</span>
                    </div>
                    <span className="text-gray-500 text-[10px]">⚔️ Attack</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex gap-1">
                      <kbd className="bg-blue-900/70 rounded px-1.5 py-0.5 text-[10px] font-mono">Shift</kbd>
                      <span className="text-gray-500 text-[10px]">or RMB</span>
                    </div>
                    <span className="text-gray-500 text-[10px]">🛡️ Shield</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spectator label */}
        {!isCombatant && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 text-xs text-gray-500 pointer-events-none select-none">
            👁️ Spectating
          </div>
        )}
      </div>

      {/* Mobile controls (pointer-events: auto) */}
      {mobile && isCombatant && !battleOver && (
        <>
          {/* Left joystick (move) */}
          <div className="absolute pointer-events-none" style={{ left: 20, bottom: 20, width: 120, height: 120 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.22)' }} />
            <div
              className="absolute rounded-full"
              style={{
                width: 48, height: 48,
                left: 36 + (joyMove.current.active ? Math.max(-36, Math.min(36, joyMove.current.dx)) : 0),
                top:  36 + (joyMove.current.active ? Math.max(-36, Math.min(36, joyMove.current.dy)) : 0),
                background: 'rgba(255,255,255,0.30)',
                border: '2px solid rgba(255,255,255,0.5)',
                transition: joyMove.current.active ? 'none' : 'left 0.1s, top 0.1s',
              }}
            />
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/40 font-bold tracking-wide">MOVE</span>
          </div>

          {/* Right look zone label */}
          <div className="absolute pointer-events-none" style={{ right: 20, bottom: 20, width: 120, height: 120 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.12)' }} />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] text-white/30 font-bold tracking-wide">LOOK</span>
          </div>

          {/* Attack button — bottom-right above look area */}
          <button
            className="absolute z-10 flex items-center justify-center active:scale-90 transition-transform select-none"
            style={{
              right: 24, bottom: 160, width: 80, height: 80,
              borderRadius: '50%',
              background: 'rgba(220,38,38,0.55)',
              border: '3px solid rgba(255,80,80,0.85)',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 0 18px rgba(220,38,38,0.5)',
              fontSize: 32,
            }}
            onTouchStart={e => { e.preventDefault(); (mountRef.current as any)?.__attack?.(); }}
          >
            ⚔️
          </button>

          {/* Shield button — left of attack */}
          <button
            className="absolute z-10 flex items-center justify-center select-none"
            style={{
              right: 120, bottom: 160, width: 68, height: 68,
              borderRadius: '50%',
              background: 'rgba(59,130,246,0.45)',
              border: '3px solid rgba(96,165,250,0.8)',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 0 14px rgba(59,130,246,0.4)',
              fontSize: 28,
            }}
            onTouchStart={e => { e.preventDefault(); (mountRef.current as any)?.__shieldOn?.(); }}
            onTouchEnd={e => { e.preventDefault(); (mountRef.current as any)?.__shieldOff?.(); }}
          >
            🛡️
          </button>
        </>
      )}

      {/* Battle over overlay */}
      <AnimatePresence>
        {battleOver && (
          <motion.div
            key="battle-over"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.82)' }}
          >
            <motion.div
              initial={{ scale: 0.7, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="text-center px-8"
            >
              <p
                className="text-5xl font-black mb-2"
                style={{
                  color: battleOver.winnerSide === 'attacker' ? atkColor : defColor,
                  textShadow: `0 0 30px ${battleOver.winnerSide === 'attacker' ? atkColor : defColor}`,
                }}
              >
                🏆 {battleOver.winnerSide === 'attacker' ? attackerPlayer?.username : defenderPlayer?.username} WINS
              </p>
              <p className="text-gray-400 text-xl">
                {battleOver.attackerScore} – {battleOver.defenderScore}
              </p>
              <p className="text-gray-600 text-sm mt-3">
                {battleOver.effect === 'siege' ? '🔴 Siege begins!' : battleOver.effect === 'destruction_choice' ? '💥 Destruction!' : '🛡️ Attacker repelled!'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
