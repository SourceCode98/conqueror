import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const ARENA_RADIUS = 11;
const MOVE_SPEED = 5.5;
const POS_SEND_MS = 50;   // 20 fps position sync
const ATTACK_ANIM_MS = 280;
const WIN_SCORE = 3;
const STAMINA_MAX = 100;
const STAMINA_ATK_COST = 28;  // consumed per swing
const STAMINA_SHD_DRAIN = 18; // per second while shielding
const STAMINA_REGEN = 22;  // per second while not shielding
const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ('ontouchstart' in window);

// ─── Arena builder ────────────────────────────────────────────────────────────
function buildArena(scene: THREE.Scene, mobile: boolean) {
  if (mobile) {
    // Absolute minimum: flat color, no lighting calc at all
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 0.28, 10),
      new THREE.MeshBasicMaterial({ color: 0xb8945e }),
    );
    scene.add(floor);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x5a4530 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.6, 0.9), pillarMat);
      pillar.position.set(Math.sin(a) * (ARENA_RADIUS - 0.8), 2.3, Math.cos(a) * (ARENA_RADIUS - 0.8));
      scene.add(pillar);
    }
    return;
  }

  // Desktop: full quality
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 0.28, 40),
    new THREE.MeshStandardMaterial({ color: 0xc8a870, roughness: 0.95 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_RADIUS, 0.38, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0x6b5230, roughness: 0.85 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.17;
  scene.add(ring);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.sin(a) * (ARENA_RADIUS - 0.8);
    const pz = Math.cos(a) * (ARENA_RADIUS - 0.8);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 4.6, 6), new THREE.MeshStandardMaterial({ color: 0x7a6545, roughness: 0.85 }));
    pillar.position.set(px, 2.3, pz);
    pillar.castShadow = true;
    scene.add(pillar);
    const torch = new THREE.PointLight(0xff7200, 1.8, 10);
    torch.position.set(px * 0.92, 5.6, pz * 0.92);
    scene.add(torch);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 4, 4), new THREE.MeshBasicMaterial({ color: 0xff9900 }));
    flame.position.copy(torch.position);
    scene.add(flame);
  }

  const mark = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.01, 12),
    new THREE.MeshStandardMaterial({ color: 0xa07030, metalness: 0.5 }),
  );
  mark.position.y = 0.15;
  scene.add(mark);
}

// ─── Player mesh ──────────────────────────────────────────────────────────────
function buildPlayerMesh(hexColor: string, mobile = false): THREE.Group {
  const col = new THREE.Color(hexColor);
  const g = new THREE.Group();

  if (mobile) {
    // Absolute minimum: MeshBasicMaterial (zero lighting cost), boxes everywhere
    const mat = new THREE.MeshBasicMaterial({ color: col });
    const skinMat = new THREE.MeshBasicMaterial({ color: 0xd4956a });
    const swordMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });

    // Legs: boxes (12 tris each) instead of cylinders
    const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);
    const legLPivot = new THREE.Group(); legLPivot.position.set(-0.14, 0.75, 0); g.add(legLPivot);
    const legRPivot = new THREE.Group(); legRPivot.position.set(0.14, 0.75, 0); g.add(legRPivot);
    const legLMesh = new THREE.Mesh(legGeo, mat); legLMesh.position.set(0, -0.375, 0); legLPivot.add(legLMesh);
    const legRMesh = new THREE.Mesh(legGeo, mat); legRMesh.position.set(0, -0.375, 0); legRPivot.add(legRMesh);
    g.userData.legL = legLPivot;
    g.userData.legR = legRPivot;

    // Torso + head: both boxes
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.9, 0.38), mat);
    torso.position.y = 1.05; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
    head.position.y = 1.65; g.add(head);

    // Sword: single thin box
    const swGrp = new THREE.Group();
    swGrp.position.set(0.44, 1.35, 0.15);
    swGrp.rotation.z = -0.18;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.06), swordMat);
    blade.position.y = 0.42; swGrp.add(blade);
    g.add(swGrp);
    g.userData.sword = swGrp;
    g.userData.swordRestZ = 0.15;

    // Shield: single box (hidden)
    const shGrp = new THREE.Group();
    shGrp.position.set(-0.44, 1.1, 0.22);
    shGrp.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.09), mat));
    shGrp.visible = false;
    g.add(shGrp);
    g.userData.shield = shGrp;

    g.userData.flash = null; // no transparent mesh on mobile
    return g;
  }

  // ── Desktop: full quality ──
  const body = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c080, roughness: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.85, roughness: 0.2 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });

  const legGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.75, 7);
  const legLPivot = new THREE.Group(); legLPivot.position.set(-0.14, 0.75, 0); g.add(legLPivot);
  const legRPivot = new THREE.Group(); legRPivot.position.set(0.14, 0.75, 0); g.add(legRPivot);
  const legLMesh = new THREE.Mesh(legGeo, body); legLMesh.position.set(0, -0.375, 0); legLPivot.add(legLMesh);
  const legRMesh = new THREE.Mesh(legGeo, body); legRMesh.position.set(0, -0.375, 0); legRPivot.add(legRMesh);
  g.userData.legL = legLPivot;
  g.userData.legR = legRPivot;

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.9, 8), body);
  torso.position.y = 1.05; g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 10), skin);
  head.position.y = 1.65; g.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), metal);
  helm.position.y = 1.65; g.add(helm);

  const swGrp = new THREE.Group();
  swGrp.position.set(0.44, 1.05, 0.15);
  swGrp.rotation.z = -0.18;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.95, 0.04), metal);
  blade.position.y = 0.47;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.065, 0.065), metal);
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), wood);
  hilt.position.y = -0.11;
  swGrp.add(blade, guard, hilt);
  g.add(swGrp);
  g.userData.sword = swGrp;
  g.userData.swordRestZ = 0.15;

  const shGrp = new THREE.Group();
  shGrp.position.set(-0.44, 1.1, 0.22);
  const shBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.09), new THREE.MeshStandardMaterial({ color: col, metalness: 0.25, roughness: 0.6 }));
  const shRim = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.69, 0.06), metal);
  shRim.position.z = 0.025;
  const shBoss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), metal);
  shGrp.add(shBody, shRim, shBoss);
  shGrp.visible = false;
  g.add(shGrp);
  g.userData.shield = shGrp;

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
  const mountRef = useRef<HTMLDivElement>(null);
  const gameState = useGameStore(s => s.gameState);
  const localId = useGameStore(s => s.localPlayerId);
  const hitEventStore = useGameStore(s => s.coliseumHitEvent);
  const battleOver = useGameStore(s => s.coliseumBattleOver);
  const clearBattleOver = useGameStore(s => s.clearColiseumBattleOver);

  const [scores, setScores] = useState({ attacker: 0, defender: 0, attackerHp: MAX_HP, defenderHp: MAX_HP, defenderMaxHp: MAX_HP });
  const [hitNotice, setHitNotice] = useState<{ label: string; color: string } | null>(null);
  const [roundOverNotice, setRoundOverNotice] = useState<{ label: string; color: string } | null>(null);
  const isPortrait = () => {
    if (typeof screen !== 'undefined' && screen.orientation?.type) {
      return screen.orientation.type.includes('portrait');
    }
    return window.innerHeight > window.innerWidth;
  };
  const [portrait, setPortrait] = useState(isPortrait);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [awaitingPortraitReturn, setAwaitingPortraitReturn] = useState(false);
  const [fightFlash, setFightFlash] = useState(false);
  const staminaRef = useRef(STAMINA_MAX);
  const staminaMaxRef = useRef(STAMINA_MAX);
  // DOM refs for zero-re-render updates
  const joyMoveKnobRef = useRef<HTMLDivElement>(null);
  const joyLookKnobRef = useRef<HTMLDivElement>(null);
  const staminaBarRef = useRef<HTMLDivElement>(null);
  const staminaTextRef = useRef<HTMLSpanElement>(null);

  const battle = gameState?.coliseumBattle;
  const isActive = gameState?.phase === 'COLISEUM_BATTLE' && !!battle;

  // Computed early so effects can reference them
  const attackerPlayer = gameState?.players.find(p => p.id === battle?.attackerId);
  const defenderPlayer = gameState?.players.find(p => p.id === battle?.defenderId);
  const atkColor = attackerPlayer ? resolvePlayerColor(attackerPlayer.color) : '#ef4444';
  const defColor = defenderPlayer ? resolvePlayerColor(defenderPlayer.color) : '#3b82f6';

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
  const mobile = isMobileDevice();

  // Live refs used inside the Three.js loop (no re-render needed)
  const joyMove = useRef<JoyState>({ cx: 0, cy: 0, dx: 0, dy: 0, active: false });
  const joyLook = useRef<JoyState>({ cx: 0, cy: 0, dx: 0, dy: 0, active: false });
  const shielding = useRef(false);
  const localPosRef = useRef({ x: 0, z: 0 });
  const yawRef = useRef(0);
  const resetPosRef = useRef(false); // signal Three.js loop to reset positions

  // ── Fullscreen helpers ──
  const enterFullscreen = () => {
    const el = document.documentElement as any;
    (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => { });
  };
  const exitFullscreen = () => {
    const doc = document as any;
    (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch?.(() => { });
  };

  // Track actual fullscreen state
  useEffect(() => {
    const onChange = () => {
      const doc = document as any;
      setIsFullscreen(!!(doc.fullscreenElement ?? doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

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

  // Hit event → score + HP update + notice + round-over flash
  useEffect(() => {
    if (!hitEventStore || !battle) return;
    setScores(prev => ({ ...prev, attacker: hitEventStore.attackerScore, defender: hitEventStore.defenderScore, attackerHp: hitEventStore.attackerHp, defenderHp: hitEventStore.defenderHp }));
    const isLocalHit = hitEventStore.defenderId === localId;
    if (hitEventStore.blocked) {
      setHitNotice({ label: '🛡️ BLOCKED!', color: '#60a5fa' });
    } else {
      setHitNotice({ label: isLocalHit ? '💥 HIT!' : '⚔️ HIT!', color: isLocalHit ? '#f87171' : '#fbbf24' });
    }
    const t = setTimeout(() => setHitNotice(null), 1100);

    if (hitEventStore.roundWon) {
      const roundWinner = hitEventStore.attackerScore > (scores.attacker) ? attackerPlayer?.username : defenderPlayer?.username;
      const winColor = hitEventStore.attackerScore > scores.attacker ? atkColor : defColor;
      setRoundOverNotice({ label: `🏅 ${roundWinner ?? '?'} wins the round!`, color: winColor });
      setTimeout(() => setRoundOverNotice(null), 2200);
    }
    return () => clearTimeout(t);
  }, [hitEventStore]);

  // When both players become ready, flash "FIGHT!"
  const readyCount = battle?.readyPlayerIds?.length ?? 0;
  useEffect(() => {
    if (readyCount >= 2) {
      setFightFlash(true);
      const t = setTimeout(() => setFightFlash(false), 1200);
      return () => clearTimeout(t);
    }
  }, [readyCount]);

  // Reset positions when a new round starts (readyCount drops to 0 between rounds)
  const prevReadyCountRef = useRef(0);
  useEffect(() => {
    if (readyCount === 0 && prevReadyCountRef.current >= 2) {
      // Signal Three.js loop to snap fighters back to start
      resetPosRef.current = true;
    }
    prevReadyCountRef.current = readyCount;
  }, [readyCount]);

  // Auto-dismiss battle result; on mobile+landscape hand off to portrait-return gate
  useEffect(() => {
    if (!battleOver) return;
    const t = setTimeout(() => {
      if (mobile && !isPortrait()) {
        setAwaitingPortraitReturn(true);
      } else {
        clearBattleOver();
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [battleOver]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once user rotates back to portrait after battle, exit fullscreen + unblock normal game
  useEffect(() => {
    if (awaitingPortraitReturn && portrait) {
      if (isFullscreen) exitFullscreen();
      setAwaitingPortraitReturn(false);
      clearBattleOver();
    }
  }, [awaitingPortraitReturn, portrait]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Camera
    const camera = new THREE.PerspectiveCamera(72, W / H, 0.1, 80);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(mobile ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting — on mobile use stronger ambient to compensate for no torch lights
    scene.add(new THREE.AmbientLight(0xffd090, mobile ? 0.75 : 0.3));
    const sun = new THREE.DirectionalLight(0xffe8b0, mobile ? 1.2 : 0.85);
    sun.position.set(5, 14, 7);
    if (!mobile) { sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); }
    scene.add(sun);

    if (!mobile) scene.fog = new THREE.FogExp2(0x120804, 0.032);

    buildArena(scene, mobile);

    // Players
    const attackerPlayer = gameState?.players.find(p => p.id === battle.attackerId);
    const defenderPlayer = gameState?.players.find(p => p.id === battle.defenderId);
    const atkColor = attackerPlayer ? resolvePlayerColor(attackerPlayer.color) : '#ef4444';
    const defColor = defenderPlayer ? resolvePlayerColor(defenderPlayer.color) : '#3b82f6';

    const isLocalAttacker = localId === battle.attackerId;
    const isLocalDefender = localId === battle.defenderId;
    const isCombatant = isLocalAttacker || isLocalDefender;

    // For spectators: localMesh = attacker, remoteMesh = defender
    const localColor = isCombatant ? (isLocalAttacker ? atkColor : defColor) : atkColor;
    const remoteColor = isCombatant ? (isLocalAttacker ? defColor : atkColor) : defColor;

    const startX = (isCombatant ? isLocalAttacker : true) ? -3.5 : 3.5;
    const startYaw = (isCombatant ? isLocalAttacker : true) ? Math.PI / 2 : -Math.PI / 2;

    localPosRef.current = { x: startX, z: 0 };
    yawRef.current = startYaw;

    const localMesh = buildPlayerMesh(localColor, mobile);
    localMesh.position.set(startX, 0, 0);
    localMesh.rotation.y = startYaw;
    scene.add(localMesh);

    const remoteMesh = buildPlayerMesh(remoteColor, mobile);
    remoteMesh.position.set(-startX, 0, 0);
    remoteMesh.rotation.y = -startYaw;
    scene.add(remoteMesh);

    // Remote state (updated from WS without triggering re-renders)
    const remote = { x: -startX, z: 0, rotation: -startYaw, shielding: false, swinging: false };
    // Spectator: also track attacker (localMesh) separately
    const remoteLocal = { x: startX, z: 0, rotation: startYaw, shielding: false, swinging: false };
    let remotePrevSwinging = false;
    let remoteLocalPrevSwinging = false;

    // Ready state — read from latest game store state each frame
    const getBothReady = () => {
      const b = useGameStore.getState().gameState?.coliseumBattle;
      return (b?.readyPlayerIds?.length ?? 0) >= 2;
    };

    // Controls state
    const keys = new Set<string>();
    let lastSend = 0;
    let lastAttack = 0;
    let lastStaminaSync = 0;
    let swordSwing = false;
    // Attacker gets bonus max stamina per extra soldier (beyond min 2)
    const myMaxStamina = isLocalAttacker
      ? STAMINA_MAX + Math.max(0, battle.attackSoldiers - 2) * 15
      : STAMINA_MAX;
    staminaRef.current = myMaxStamina;
    staminaMaxRef.current = myMaxStamina;
    let walkPhase = 0;       // walk cycle accumulator
    let remoteWalkPhase = 0; // for remote player

    // ── Expose attack + shield to React buttons ──
    function doAttack() {
      if (!getBothReady()) return;
      const now = performance.now();
      if (now - lastAttack < 950) return;
      if (swordSwing) return;
      if (staminaRef.current < STAMINA_ATK_COST) return;
      staminaRef.current = Math.max(0, staminaRef.current - STAMINA_ATK_COST);
      lastAttack = now;
      swordSwing = true;
      const sw = localMesh.userData.sword as THREE.Group;
      sw.rotation.x = -1.1;
      sw.position.z = 0.55;
      setTimeout(() => { sw.rotation.x = 0; sw.position.z = localMesh.userData.swordRestZ; swordSwing = false; }, ATTACK_ANIM_MS);
      wsService.send({ type: 'COLISEUM_ATTACK', payload: { gameId: gameState!.gameId } });
    }

    // ── Projectiles (spectator throws) ──
    interface Projectile { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }
    const projectiles: Projectile[] = [];

    function spawnProjectile(targetX: number, targetZ: number) {
      const geo = new THREE.SphereGeometry(0.18, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
      const mesh = new THREE.Mesh(geo, mat);
      // Spawn from random spectator position at edge
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnR = ARENA_RADIUS + 1.5;
      const sx = Math.sin(spawnAngle) * spawnR;
      const sz = Math.cos(spawnAngle) * spawnR;
      mesh.position.set(sx, 2.5, sz);
      scene.add(mesh);
      const dx = targetX - sx, dz = targetZ - sz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const speed = 14;
      projectiles.push({ mesh, vx: (dx / dist) * speed, vy: 2, vz: (dz / dist) * speed, life: 1.5 });
    }

    // Attach to DOM node so React buttons can call them
    (container as any).__attack = doAttack;
    (container as any).__shieldOn = () => { shielding.current = true; };
    (container as any).__shieldOff = () => { shielding.current = false; };
    (container as any).__throwAt = (targetId: string) => {
      const tx = targetId === battle.attackerId ? localMesh.position.x : remoteMesh.position.x;
      const tz = targetId === battle.attackerId ? localMesh.position.z : remoteMesh.position.z;
      spawnProjectile(tx, tz);
    };

    // ── WS subscription ──
    let remoteStatesRef = useGameStore.getState().coliseumPlayerStates;
    const unsubWs = wsService.onMessage(msg => {
      if (msg.type === 'COLISEUM_PLAYER_STATES') {
        if (!isCombatant) {
          // Spectator: update both meshes from server state
          const atkState = msg.payload.states[battle.attackerId];
          const defState = msg.payload.states[battle.defenderId];
          if (atkState) { remoteLocal.x = atkState.x; remoteLocal.z = atkState.z; remoteLocal.rotation = atkState.rotation; remoteLocal.shielding = atkState.shielding; remoteLocal.swinging = atkState.swinging; }
          if (defState) { remote.x = defState.x; remote.z = defState.z; remote.rotation = defState.rotation; remote.shielding = defState.shielding; remote.swinging = defState.swinging; }
        } else {
          const remoteId = isLocalAttacker ? battle.defenderId : battle.attackerId;
          const rs = msg.payload.states[remoteId];
          if (rs) { remote.x = rs.x; remote.z = rs.z; remote.rotation = rs.rotation; remote.shielding = rs.shielding; remote.swinging = rs.swinging; }
        }
      }
      if (msg.type === 'COLISEUM_HIT') {
        // Flash the hit target mesh
        let flashMesh: THREE.Group;
        if (!isCombatant) {
          flashMesh = msg.payload.defenderId === battle.defenderId ? remoteMesh : localMesh;
        } else {
          flashMesh = msg.payload.defenderId === localId ? localMesh : remoteMesh;
        }
        const fl = flashMesh.userData.flash as THREE.Mesh | null;
        if (fl) {
          (fl.material as THREE.MeshBasicMaterial).opacity = 0.65;
          setTimeout(() => { (fl.material as THREE.MeshBasicMaterial).opacity = 0; }, 300);
        }
        if (!msg.payload.blocked) shakeAmt = 0.22;
      }
      if (msg.type === 'COLISEUM_THROW') {
        // Spawn projectile aimed at target fighter position
        const targetMesh = msg.payload.targetId === battle.attackerId ? localMesh : remoteMesh;
        spawnProjectile(targetMesh.position.x, targetMesh.position.z);
      }
    });

    // ── Keyboard ──
    const onKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling while game is active
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
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
      if (document.pointerLockElement === renderer.domElement) yawRef.current -= e.movementX * 0.0028;
    };
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    // ── Touch / virtual joystick ──
    const touchIds = new Map<number, 'move' | 'look'>();
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const cW = container.clientWidth;
      for (const t of Array.from(e.changedTouches)) {
        const relX = t.clientX / cW;
        if (relX < 0.5 && !joyMove.current.active) {
          joyMove.current = { active: true, cx: t.clientX, cy: t.clientY, dx: 0, dy: 0 };
          touchIds.set(t.identifier, 'move');
        } else if (relX >= 0.5 && !joyLook.current.active) {
          joyLook.current = { active: true, cx: t.clientX, cy: t.clientY, dx: 0, dy: 0 };
          touchIds.set(t.identifier, 'look');
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        const kind = touchIds.get(t.identifier);
        if (kind === 'move') {
          joyMove.current.dx = t.clientX - joyMove.current.cx;
          joyMove.current.dy = t.clientY - joyMove.current.cy;
        } else if (kind === 'look') {
          // Positional joystick: offset drives turn speed in game loop
          joyLook.current.dx = t.clientX - joyLook.current.cx;
          joyLook.current.dy = t.clientY - joyLook.current.cy;
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        const kind = touchIds.get(t.identifier);
        if (kind === 'move') joyMove.current = { active: false, cx: 0, cy: 0, dx: 0, dy: 0 };
        if (kind === 'look') joyLook.current = { active: false, cx: 0, cy: 0, dx: 0, dy: 0 };
        touchIds.delete(t.identifier);
      }
    };
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: false });

    // ── Resize ──
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Game loop ──
    let animId = 0;
    let lastT = performance.now();
    let lastJoyUpdate = 0;
    let shakeAmt = 0;

    const FRAME_MS = mobile ? 1000 / 30 : 0; // cap at 30fps on mobile

    const tick = () => {
      animId = requestAnimationFrame(tick);
      const now = performance.now();
      // Skip frame to enforce 30fps cap on mobile
      if (FRAME_MS > 0 && now - lastT < FRAME_MS) return;
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;

      // ── Position reset (new round) ──
      if (resetPosRef.current) {
        resetPosRef.current = false;
        localPosRef.current = { x: startX, z: 0 };
        yawRef.current = startYaw;
        localMesh.position.set(startX, 0, 0);
        localMesh.rotation.y = startYaw;
        remote.x = -startX; remote.z = 0; remote.rotation = -startYaw;
        remoteMesh.position.set(-startX, 0, 0);
        remoteMesh.rotation.y = -startYaw;
      }

      // ── Projectile physics ──
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt;
        p.vy -= 9 * dt; // gravity
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        if (p.life <= 0 || p.mesh.position.y < -1) {
          scene.remove(p.mesh);
          projectiles.splice(i, 1);
        }
      }

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
        // ── Input (frozen until both players ready) ──
        const DEAD = 8;
        if (!getBothReady()) { /* no movement */ } else
          if (mobile) {
            const jm = joyMove.current;
            if (Math.abs(jm.dx) > DEAD) mx = Math.max(-1, Math.min(1, jm.dx / 55));
            if (Math.abs(jm.dy) > DEAD) mz = Math.max(-1, Math.min(1, jm.dy / -55));
            // Look joystick: x-offset → yaw rotation speed
            if (joyLook.current.active && Math.abs(joyLook.current.dx) > DEAD) {
              yawRef.current -= Math.max(-1, Math.min(1, joyLook.current.dx / 50)) * dt * 2.8;
            }
          } else {
            if (keys.has('KeyW') || keys.has('ArrowUp')) mz = 1;
            if (keys.has('KeyS') || keys.has('ArrowDown')) mz = -1;
            if (keys.has('KeyA') || keys.has('ArrowLeft')) mx = -1;
            if (keys.has('KeyD') || keys.has('ArrowRight')) mx = 1;
          }

        // ── Movement (relative to camera yaw) ──
        const y = yawRef.current;
        const spd = MOVE_SPEED * dt;
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

        // ── Stamina ──
        if (shielding.current) {
          staminaRef.current = Math.max(0, staminaRef.current - STAMINA_SHD_DRAIN * dt);
          if (staminaRef.current === 0) shielding.current = false; // force drop shield
        } else {
          staminaRef.current = Math.min(staminaMaxRef.current, staminaRef.current + STAMINA_REGEN * dt);
        }
        if (now - lastStaminaSync > 80) {
          lastStaminaSync = now;
          const pct = (staminaRef.current / staminaMaxRef.current) * 100;
          const sc = staminaRef.current > 50 ? '#eab308' : staminaRef.current > 25 ? '#f97316' : '#ef4444';
          if (staminaBarRef.current) {
            staminaBarRef.current.style.width = `${pct}%`;
            staminaBarRef.current.style.background = sc;
            staminaBarRef.current.style.boxShadow = `0 0 8px ${staminaRef.current > 50 ? '#eab308aa' : '#f97316aa'}`;
          }
          if (staminaTextRef.current) staminaTextRef.current.style.color = sc;
        }

        // ── Send position update ──
        if (now - lastSend > (mobile ? 100 : POS_SEND_MS)) {
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

      // ── Spectator: also update localMesh (attacker) from server state ──
      if (!isCombatant) {
        localMesh.position.set(remoteLocal.x, 0, remoteLocal.z);
        localMesh.rotation.y = remoteLocal.rotation;
        (localMesh.userData.shield as THREE.Group).visible = remoteLocal.shielding;
        if (remoteLocal.swinging && !remoteLocalPrevSwinging) {
          const lsw = localMesh.userData.sword as THREE.Group;
          lsw.rotation.x = -1.1;
          lsw.position.z = 0.55;
          setTimeout(() => { lsw.rotation.x = 0; lsw.position.z = localMesh.userData.swordRestZ; }, ATTACK_ANIM_MS);
        }
        remoteLocalPrevSwinging = remoteLocal.swinging;
      }

      // ── Leg animation (spectator localMesh = attacker) ──
      if (!isCombatant) {
        const slL = localMesh.userData.legL as THREE.Group;
        const slR = localMesh.userData.legR as THREE.Group;
        const localMoving = Math.abs(remoteLocal.x - localMesh.position.x) > 0.005 || Math.abs(remoteLocal.z - localMesh.position.z) > 0.005;
        if (remoteLocal.shielding) {
          slL.rotation.x = 0.3; slR.rotation.x = 0.3;
        } else if (localMoving) {
          walkPhase += dt * 7;
          slL.rotation.x = Math.sin(walkPhase) * 0.55;
          slR.rotation.x = -Math.sin(walkPhase) * 0.55;
        } else {
          slL.rotation.x *= 0.82; slR.rotation.x *= 0.82;
        }
      }

      // ── Leg animation (local) ──
      if (isCombatant) {
        const isMoving = Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05;
        const lL = localMesh.userData.legL as THREE.Group;
        const lR = localMesh.userData.legR as THREE.Group;
        if (swordSwing) {
          // Attack pose: legs spread apart slightly
          lL.rotation.x = -0.35;
          lR.rotation.x = 0.35;
        } else if (shielding.current) {
          // Shield stance: crouch forward
          lL.rotation.x = 0.3;
          lR.rotation.x = 0.3;
        } else if (isMoving) {
          walkPhase += dt * 8.5;
          lL.rotation.x = Math.sin(walkPhase) * 0.55;
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
          rlL.rotation.x = Math.sin(remoteWalkPhase) * 0.55;
          rlR.rotation.x = -Math.sin(remoteWalkPhase) * 0.55;
        } else {
          rlL.rotation.x *= 0.82; rlR.rotation.x *= 0.82;
        }
      }

      // Refresh joystick knobs via direct DOM at ~30fps (no React re-render)
      if (mobile && now - lastJoyUpdate > 33) {
        lastJoyUpdate = now;
        if (joyMoveKnobRef.current) {
          const jm = joyMove.current;
          const kx = jm.active ? Math.max(-36, Math.min(36, jm.dx)) : 0;
          const ky = jm.active ? Math.max(-36, Math.min(36, jm.dy)) : 0;
          joyMoveKnobRef.current.style.left = `${36 + kx}px`;
          joyMoveKnobRef.current.style.top = `${36 + ky}px`;
          joyMoveKnobRef.current.style.transition = jm.active ? 'none' : 'left 0.1s, top 0.1s';
        }
        if (joyLookKnobRef.current) {
          const jl = joyLook.current;
          const kx = jl.active ? Math.max(-36, Math.min(36, jl.dx)) : 0;
          const ky = jl.active ? Math.max(-36, Math.min(36, jl.dy)) : 0;
          joyLookKnobRef.current.style.left = `${36 + kx}px`;
          joyLookKnobRef.current.style.top = `${36 + ky}px`;
          joyLookKnobRef.current.style.transition = jl.active ? 'none' : 'left 0.1s, top 0.1s';
        }
      }

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
      // Dispose all geometries and materials to free GPU memory
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [isActive, mobile && portrait]); // eslint-disable-line react-hooks/exhaustive-deps

  // After battle: mobile + still landscape → gate until user rotates back to portrait
  if (awaitingPortraitReturn) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center gap-6 p-8 text-center"
        style={{ background: 'radial-gradient(ellipse at center, #051a0e 0%, #000 70%)' }}>
        <div className="text-7xl" style={{ animation: 'spin 2s linear infinite', animationDirection: 'reverse' }}>📱</div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-white text-2xl font-black">Rotate Back</p>
          <p className="text-gray-400 text-sm">Rotate your device back to portrait to continue playing</p>
        </div>
        {isFullscreen && (
          <button
            onClick={exitFullscreen}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-all"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}
          >
            <span>⛶</span> Exit Fullscreen
          </button>
        )}
        <div className="text-emerald-400 text-4xl">✓</div>
      </div>
    );
  }

  // During battle: mobile + portrait → show rotate-to-landscape prompt (battle frozen)
  if (mobile && portrait && isActive) {
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center gap-6 p-8 text-center"
        style={{ background: 'radial-gradient(ellipse at center, #1a0e05 0%, #000 70%)' }}>
        {/* Spinning phone icon */}
        <div className="text-7xl" style={{ animation: 'spin 2s linear infinite' }}>📱</div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-white text-2xl font-black">Rotate to Landscape</p>
          <p className="text-gray-400 text-sm">The coliseum battle requires landscape orientation</p>
        </div>

        {/* Fullscreen permission button */}
        <button
          onClick={enterFullscreen}
          className="flex items-center gap-3 px-7 py-3.5 rounded-2xl font-black text-base transition-all active:scale-95"
          style={isFullscreen
            ? { background: 'rgba(74,222,128,0.15)', border: '2px solid rgba(74,222,128,0.6)', color: '#4ade80' }
            : { background: 'linear-gradient(135deg, #7c3aed, #a855f7)', boxShadow: '0 0 24px rgba(168,85,247,0.5)', color: 'white', border: '2px solid rgba(168,85,247,0.4)' }
          }
        >
          {isFullscreen ? (
            <><span className="text-xl">✓</span> Fullscreen Active</>
          ) : (
            <><span className="text-xl">⛶</span> Enable Fullscreen</>
          )}
        </button>

        <p className="text-gray-600 text-xs">
          {isFullscreen ? 'Now rotate your device ↻' : 'Tap to request fullscreen for an immersive experience'}
        </p>

        <div className="text-amber-400 text-4xl">⚔️</div>
      </div>
    );
  }

  if (!isActive && !battleOver) return null;

  function throwAt(targetId: string) {
    if (!battle || !gameState) return;
    wsService.send({ type: 'COLISEUM_THROW', payload: { gameId: gameState.gameId, targetId } });
    // Also spawn locally for immediate feedback
    (mountRef.current as any)?.__throwAt?.(targetId);
  }

  const localIsAttacker = localId === battle?.attackerId;
  const isCombatant = localId === battle?.attackerId || localId === battle?.defenderId;
  const currentRound = scores.attacker + scores.defender + 1;

  return (
    <div className="fixed inset-0 z-[60] bg-black" style={{ touchAction: 'none' }}>
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

        {/* Ready screen overlay */}
        <AnimatePresence>
          {isCombatant && readyCount < 2 && (
            <motion.div
              key="ready-screen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.4 } }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 pointer-events-auto"
              style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}
            >
              <p className="text-amber-400 text-2xl font-black tracking-widest">⚔️ COLISEUM</p>
              <p className="text-white text-lg font-black tracking-widest opacity-70">
                ROUND {currentRound} of {WIN_SCORE}
              </p>

              {/* Player readiness cards */}
              <div className="flex gap-4">
                {[
                  { id: battle?.attackerId, name: attackerPlayer?.username ?? '?', color: atkColor },
                  { id: battle?.defenderId, name: defenderPlayer?.username ?? '?', color: defColor },
                ].map(p => {
                  const isReady = battle?.readyPlayerIds?.includes(p.id ?? '') ?? false;
                  return (
                    <div key={p.id}
                      className="flex flex-col items-center gap-2 rounded-2xl px-5 py-4 transition-all duration-300"
                      style={{ background: isReady ? `${p.color}22` : 'rgba(255,255,255,0.05)', border: `2px solid ${isReady ? p.color : 'rgba(255,255,255,0.1)'}` }}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg"
                        style={{ background: `${p.color}33`, color: p.color }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold" style={{ color: p.color }}>{p.name}</span>
                      <span className="text-xs font-black" style={{ color: isReady ? '#4ade80' : '#6b7280' }}>
                        {isReady ? '✓ READY' : '…'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Ready button for local combatant */}
              {(() => {
                const localIsReady = battle?.readyPlayerIds?.includes(localId ?? '') ?? false;
                return !localIsReady ? (
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={() => wsService.send({ type: 'COLISEUM_READY', payload: { gameId: gameState!.gameId } })}
                    className="px-10 py-4 rounded-2xl font-black text-xl tracking-wider"
                    style={{ background: 'linear-gradient(135deg, #b45309, #f59e0b)', boxShadow: '0 0 30px rgba(245,158,11,0.5)' }}
                  >
                    READY
                  </motion.button>
                ) : (
                  <p className="text-green-400 font-black text-lg animate-pulse">Waiting for opponent…</p>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* FIGHT! flash when both ready */}
        <AnimatePresence>
          {fightFlash && (
            <motion.div
              key="fight-flash"
              initial={{ opacity: 0, scale: 1.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
            >
              <p className="font-black text-6xl" style={{ color: '#f59e0b', textShadow: '0 0 40px #f59e0b, 0 0 80px #f59e0b88' }}>
                FIGHT!
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Centre: hit notice + round over */}
        <div className="flex-1 flex flex-col items-center justify-start pt-16 gap-3">
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
          <AnimatePresence>
            {roundOverNotice && (
              <motion.div
                key="round-over"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.2 }}
                transition={{ duration: 0.25 }}
                className="rounded-2xl px-8 py-4 text-2xl font-black text-center"
                style={{ background: `${roundOverNotice.color}22`, color: roundOverNotice.color, border: `2px solid ${roundOverNotice.color}80`, backdropFilter: 'blur(6px)', textShadow: `0 0 20px ${roundOverNotice.color}` }}
              >
                {roundOverNotice.label}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stamina bar — local combatant only. Updated via DOM ref, never re-renders */}
        {isCombatant && (
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none flex flex-col items-center pb-3"
            style={{ bottom: mobile ? 250 : 16 }}>
            <span ref={staminaTextRef} className="text-[9px] font-black tracking-widest mb-0.5"
              style={{ color: '#eab308', opacity: 0.85 }}>
              STAMINA
            </span>
            <div className="rounded-full overflow-hidden" style={{ width: 160, height: 6, background: 'rgba(255,255,255,0.08)' }}>
              <div
                ref={staminaBarRef}
                className="h-full rounded-full"
                style={{ width: '100%', background: '#eab308', boxShadow: '0 0 8px #eab308aa', transition: 'width 0.08s linear, background 0.3s' }}
              />
            </div>
          </div>
        )}

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

        {/* Spectator label + throw buttons */}
        {!isCombatant && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
            <div className="text-xs text-gray-500 pointer-events-none select-none">👁️ Spectating</div>
            {isActive && (
              <div className="flex gap-2 pointer-events-auto">
                <button
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold select-none active:scale-90 transition-transform"
                  style={{ background: `${atkColor}22`, border: `1px solid ${atkColor}60`, color: atkColor }}
                  onTouchStart={e => { e.preventDefault(); throwAt(battle!.attackerId); }}
                  onClick={() => throwAt(battle!.attackerId)}
                  title={`Throw at ${attackerPlayer?.username ?? '?'}`}
                >
                  🍅 {attackerPlayer?.username ?? '?'}
                </button>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold select-none active:scale-90 transition-transform"
                  style={{ background: `${defColor}22`, border: `1px solid ${defColor}60`, color: defColor }}
                  onTouchStart={e => { e.preventDefault(); throwAt(battle!.defenderId); }}
                  onClick={() => throwAt(battle!.defenderId)}
                  title={`Throw at ${defenderPlayer?.username ?? '?'}`}
                >
                  🍅 {defenderPlayer?.username ?? '?'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile controls (pointer-events: auto) */}
      {mobile && isCombatant && !battleOver && (
        <>
          {/* Left joystick (move) — knob position updated via DOM ref, no re-render */}
          <div className="absolute pointer-events-none" style={{ left: 20, bottom: 20, width: 120, height: 120 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.22)' }} />
            <div
              ref={joyMoveKnobRef}
              className="absolute rounded-full"
              style={{ width: 48, height: 48, left: 36, top: 36, background: 'rgba(255,255,255,0.30)', border: '2px solid rgba(255,255,255,0.5)', transition: 'left 0.1s, top 0.1s' }}
            />
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/40 font-bold tracking-wide">MOVE</span>
          </div>

          {/* Right look joystick — knob position updated via DOM ref, no re-render */}
          <div className="absolute pointer-events-none" style={{ right: 20, bottom: 20, width: 120, height: 120 }}>
            <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.18)' }} />
            <div
              ref={joyLookKnobRef}
              className="absolute rounded-full"
              style={{ width: 48, height: 48, left: 36, top: 36, background: 'rgba(255,255,255,0.22)', border: '2px solid rgba(255,255,255,0.42)', transition: 'left 0.1s, top 0.1s' }}
            />
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/40 font-bold tracking-wide">LOOK</span>
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
