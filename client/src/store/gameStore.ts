import { create } from 'zustand';
import type {
  PublicGameState,
  PublicPlayerState,
  ResourceBundle,
  EdgeId,
  AxialCoord,
  ResourceType,
  VertexId,
} from '@conqueror/shared';
import { hasResources, BUILD_COSTS, ALL_RESOURCES } from '@conqueror/shared';

export interface GameToast {
  id: string;
  type: 'dice_resources' | 'bank_trade' | 'action' | 'horn' | 'chat' | 'stolen';
  playerId: string;
  username: string;
  data: Record<string, any>;
  timestamp: number;
}

export type InteractionMode = null | 'place_settlement' | 'place_city' | 'place_road' | 'move_bandit' | 'recruit_soldier' | 'attack' | 'transfer_soldiers';

interface GameStore {
  gameState: PublicGameState | null;
  localPlayerId: string | null;
  chatMessages: Array<{ fromPlayerId: string; username: string; text: string; timestamp: number }>;
  toasts: GameToast[];
  addToast: (toast: Omit<GameToast, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;

  // Board interaction mode
  boardMode: InteractionMode;
  setBoardMode: (mode: InteractionMode) => void;

  // Road building card
  roadBuildingEdges: EdgeId[] | null;
  startRoadBuilding: () => void;
  addRoadBuildingEdge: (edgeId: EdgeId) => void;
  cancelRoadBuilding: () => void;

  // Bandit move
  pendingBanditCoord: AxialCoord | null;
  setPendingBanditCoord: (coord: AxialCoord | null) => void;

  // War mode: attack source + target vertex
  attackFromVertex: VertexId | null;
  setAttackFromVertex: (v: VertexId | null) => void;
  attackTargetVertex: VertexId | null;
  setAttackTargetVertex: (v: VertexId | null) => void;

  // War mode: transfer soldiers — source vertex
  transferFromVertex: VertexId | null;
  setTransferFromVertex: (v: VertexId | null) => void;
  transferToVertex: VertexId | null;
  setTransferToVertex: (v: VertexId | null) => void;

  // Drag-and-drop piece placement
  dragPiece: { type: 'settlement' | 'city' | 'road' | 'bandit'; svgX: number; svgY: number } | null;
  setDragPiece: (piece: { type: 'settlement' | 'city' | 'road' | 'bandit'; svgX: number; svgY: number } | null) => void;

  // Trade modal — open panel + side (give/want) + callback used by ResourceHand
  tradePanel: 'bank' | 'offer' | null;
  tradeSide: 'give' | 'want';
  openTradePanel: (type: 'bank' | 'offer') => void;
  closeTradePanel: () => void;
  setTradeSide: (side: 'give' | 'want') => void;
  // Set by the open trade panel; called by ResourceHand when a hand card is clicked
  _tradeCardCb: ((r: ResourceType) => void) | null;
  setTradeCardCb: (fn: ((r: ResourceType) => void) | null) => void;

  // Combat modal state
  combatModal: {
    phase: 'rolling'; // waiting for dice rolls
    attackerId: string;
    defenderId: string;
    attackerName: string;
    defenderName: string;
    timeoutSecs: number;
    attackerDie: number | null;   // null = not yet revealed
    defenderDie: number | null;
  } | {
    phase: 'result';
    attackerDie: number; defenderDie: number;
    attackSoldiers: number; defenderSoldiers: number;
    cityBonus: number; garrisonBonus: number;
    attackerForce: number; defenderForce: number;
    attackerWon: boolean; effect: 'siege' | 'destruction_choice' | 'repelled';
    attackerName: string; defenderName: string;
    attackerSoldierLoss: number; defenderSoldierLoss: number;
  } | null;
  setCombatDicePhase: (data: { attackerId: string; defenderId: string; attackerName: string; defenderName: string; timeoutSecs: number }) => void;
  revealCombatDie: (side: 'attacker' | 'defender', value: number) => void;
  setCombatResult: (r: Extract<GameStore['combatModal'], { phase: 'result' }>) => void;
  clearCombatModal: () => void;

  // Deal closed overlay
  dealClosed: { activePlayerId: string; partnerId: string } | null;
  setDealClosed: (deal: { activePlayerId: string; partnerId: string } | null) => void;

  // War event overlay
  warEvent: { effect: 'siege' | 'destruction_choice' | 'repelled'; attackerId: string; defenderId: string } | null;
  setWarEvent: (e: { effect: 'siege' | 'destruction_choice' | 'repelled'; attackerId: string; defenderId: string } | null) => void;

  // Stolen card reveal (shown to victim after being robbed)
  stolenReveal: { resource: ResourceType; thiefName: string } | null;
  clearStolenReveal: () => void;

  // Final scores revealed at game over (includes hidden VP cards for all players)
  finalScores: Record<string, number> | null;
  eloChanges: Record<string, number> | null;
  setFinalScores: (scores: Record<string, number>, eloChanges?: Record<string, number>) => void;

  // Coliseum battle real-time state
  coliseumPlayerStates: Record<string, { x: number; z: number; rotation: number; shielding: boolean; swinging: boolean }> | null;
  setColiseumPlayerStates: (s: GameStore['coliseumPlayerStates']) => void;
  coliseumHitEvent: { attackerId: string; defenderId: string; attackerScore: number; defenderScore: number; attackerHp: number; defenderHp: number; blocked: boolean } | null;
  setColiseumHitEvent: (e: GameStore['coliseumHitEvent']) => void;
  coliseumBattleOver: { winnerId: string; winnerSide: 'attacker' | 'defender'; attackerScore: number; defenderScore: number; effect: string; attackerName: string; defenderName: string } | null;
  setColiseumBattleOver: (e: GameStore['coliseumBattleOver']) => void;
  clearColiseumBattleOver: () => void;

  // Lobby settings broadcast by host
  lobbySettings: { turnTimeLimit: number | null; hornCooldownSecs: number; warMode: boolean; warVariants: Record<string, boolean> } | null;
  setLobbySettings: (s: GameStore['lobbySettings']) => void;

  // WebSocket connection status
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;

  // Play-again voting
  playAgainPoll: { votes: Record<string, boolean | null>; secondsLeft: number } | null;
  playAgainResult: { type: 'start'; newGameId: string } | { type: 'closed' } | null;
  setPlayAgainPoll: (votes: Record<string, boolean | null>, secondsLeft: number) => void;
  setPlayAgainResult: (result: { type: 'start'; newGameId: string } | { type: 'closed' }) => void;
  clearPlayAgain: () => void;

  // Setters
  setLocalPlayerId: (id: string) => void;
  resetGame: () => void;
  applyGameState: (state: PublicGameState) => void;
  addChatMessage: (msg: { fromPlayerId: string; username: string; text: string; timestamp: number }) => void;

  // Derived
  myPlayer: () => PublicPlayerState | null;
  isMyTurn: () => boolean;
  canAfford: (item: 'road' | 'settlement' | 'city' | 'devCard') => boolean;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  localPlayerId: null,
  chatMessages: [],
  toasts: [],
  combatModal: null,
  setCombatDicePhase: (data) => set(s => ({
    combatModal: s.combatModal?.phase === 'rolling'
      ? { ...s.combatModal, ...data } // merge if already open (optimistic → real)
      : { phase: 'rolling', ...data, attackerDie: null, defenderDie: null },
  })),
  revealCombatDie: (side, value) => set(s => {
    if (!s.combatModal || s.combatModal.phase !== 'rolling') return s;
    return {
      combatModal: {
        ...s.combatModal,
        attackerDie: side === 'attacker' ? value : s.combatModal.attackerDie,
        defenderDie: side === 'defender' ? value : s.combatModal.defenderDie,
      },
    };
  }),
  setCombatResult: (r) => set({ combatModal: r }),
  clearCombatModal: () => set({ combatModal: null }),

  stolenReveal: null,
  finalScores: null,
  eloChanges: null,
  boardMode: null,
  roadBuildingEdges: null,
  pendingBanditCoord: null,
  dragPiece: null,
  tradePanel: null,
  tradeSide: 'give',
  _tradeCardCb: null,

  attackFromVertex: null,
  setAttackFromVertex: (v) => set({ attackFromVertex: v }),
  attackTargetVertex: null,
  setAttackTargetVertex: (v) => set({ attackTargetVertex: v }),

  transferFromVertex: null,
  setTransferFromVertex: (v) => set({ transferFromVertex: v }),
  transferToVertex: null,
  setTransferToVertex: (v) => set({ transferToVertex: v }),

  wsConnected: true,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  playAgainPoll: null,
  playAgainResult: null,
  setPlayAgainPoll: (votes, secondsLeft) => set({ playAgainPoll: { votes, secondsLeft } }),
  setPlayAgainResult: (result) => set({ playAgainPoll: null, playAgainResult: result }),
  clearPlayAgain: () => set({ playAgainPoll: null, playAgainResult: null }),

  dealClosed: null,
  setDealClosed: (deal) => set({ dealClosed: deal }),

  warEvent: null,
  setWarEvent: (e) => set({ warEvent: e }),

  clearStolenReveal: () => set({ stolenReveal: null }),
  setFinalScores: (scores, eloChanges) => set({ finalScores: scores, eloChanges: eloChanges ?? null }),

  coliseumPlayerStates: null,
  setColiseumPlayerStates: (s) => set({ coliseumPlayerStates: s }),
  coliseumHitEvent: null,
  setColiseumHitEvent: (e) => set({ coliseumHitEvent: e }),
  coliseumBattleOver: null,
  setColiseumBattleOver: (e) => set({ coliseumBattleOver: e }),
  clearColiseumBattleOver: () => set({ coliseumBattleOver: null }),

  lobbySettings: null,
  setLobbySettings: (s) => set({ lobbySettings: s }),

  setLocalPlayerId: (id) => set({ localPlayerId: id }),

  addToast: (toast) => set(s => ({
    toasts: [...s.toasts, { ...toast, id: `${Date.now()}-${Math.random()}`, timestamp: Date.now() }].slice(-8),
  })),

  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  resetGame: () => set({
    gameState: null,
    chatMessages: [],
    toasts: [],
    dealClosed: null,
    warEvent: null,
    stolenReveal: null,
    finalScores: null,
    eloChanges: null,
    boardMode: null,
    roadBuildingEdges: null,
    pendingBanditCoord: null,
    attackFromVertex: null,
    attackTargetVertex: null,
    combatModal: null,
    dragPiece: null,
    tradePanel: null,
    tradeSide: 'give',
    _tradeCardCb: null,
    playAgainPoll: null,
    playAgainResult: null,
    coliseumPlayerStates: null,
    coliseumHitEvent: null,
    coliseumBattleOver: null,
  }),

  applyGameState: (state) => {
    const s = get();
    const prev = s.gameState;
    const playerOrPhaseChanged =
      !prev ||
      prev.activePlayerId !== state.activePlayerId ||
      prev.phase !== state.phase;

    let newMode: InteractionMode = s.boardMode;
    let newRoadBuilding = s.roadBuildingEdges;
    let newPendingBandit = s.pendingBanditCoord;

    if (playerOrPhaseChanged) {
      newRoadBuilding = null;
      newPendingBandit = null;
      const isMyTurn = state.activePlayerId === s.localPlayerId;
      newMode = (state.phase === 'ROBBER' && isMyTurn) ? 'move_bandit' : null;
    }

    // Detect robbery: when exiting ROBBER phase, check if local player lost a resource
    if (prev?.phase === 'ROBBER' && state.phase !== 'ROBBER' && s.localPlayerId && prev) {
      const prevMe = prev.players.find(p => p.id === s.localPlayerId);
      const newMe  = state.players.find(p => p.id === s.localPlayerId);
      if (prevMe && newMe) {
        const lost = ALL_RESOURCES.find(r => (newMe.resources as any)[r] < (prevMe.resources as any)[r]);
        if (lost) {
          const thiefPlayer = state.players.find(p => p.id === prev.activePlayerId);
          s.addToast({
            type: 'stolen',
            playerId: thiefPlayer?.id ?? '',
            username: thiefPlayer?.username ?? 'Someone',
            data: { resource: lost },
          });
          set({ stolenReveal: { resource: lost, thiefName: thiefPlayer?.username ?? 'Someone' } });
        }
      }
    }

    set({
      gameState: state,
      boardMode: newMode,
      roadBuildingEdges: newRoadBuilding,
      pendingBanditCoord: newPendingBandit,
      // Clear dice combat modal when entering coliseum battle
      ...(state.phase === 'COLISEUM_BATTLE' ? { combatModal: null } : {}),
    });
  },

  addChatMessage: (msg) => set(s => {
    // Deduplicate: same sender + same timestamp = duplicate from reconnect
    const key = `${msg.fromPlayerId}:${msg.timestamp}`;
    if (s.chatMessages.some(m => `${m.fromPlayerId}:${m.timestamp}` === key)) return s;
    return { chatMessages: [...s.chatMessages, msg].slice(-100) };
  }),

  setBoardMode: (mode) => set({ boardMode: mode }),

  startRoadBuilding: () => set({ roadBuildingEdges: [], boardMode: 'place_road' }),

  addRoadBuildingEdge: (edgeId) => set(s => {
    if (s.roadBuildingEdges === null) return {};
    const newEdges = [...s.roadBuildingEdges, edgeId];
    return {
      roadBuildingEdges: newEdges,
      boardMode: newEdges.length < 2 ? 'place_road' : null,
    };
  }),

  cancelRoadBuilding: () => set({ roadBuildingEdges: null, boardMode: null }),

  setPendingBanditCoord: (coord) => set({ pendingBanditCoord: coord, boardMode: coord ? null : 'move_bandit' }),

  setDragPiece: (piece) => set({ dragPiece: piece }),

  openTradePanel: (type) => set({ tradePanel: type, tradeSide: 'give', _tradeCardCb: null, boardMode: null }),
  closeTradePanel: () => set({ tradePanel: null, tradeSide: 'give', _tradeCardCb: null }),
  setTradeSide: (side) => set({ tradeSide: side }),
  setTradeCardCb: (fn) => set({ _tradeCardCb: fn }),

  myPlayer: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId) return null;
    return gameState.players.find(p => p.id === localPlayerId) ?? null;
  },

  isMyTurn: () => {
    const { gameState, localPlayerId } = get();
    if (!gameState || !localPlayerId) return false;
    return gameState.activePlayerId === localPlayerId;
  },

  canAfford: (item) => {
    const player = get().myPlayer();
    if (!player) return false;
    return hasResources(player.resources, BUILD_COSTS[item] as ResourceBundle);
  },
}));
