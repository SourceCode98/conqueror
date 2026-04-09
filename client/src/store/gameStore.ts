import { create } from 'zustand';
import type {
  PublicGameState,
  PublicPlayerState,
  ResourceBundle,
  EdgeId,
  AxialCoord,
  ResourceType,
} from '@conqueror/shared';
import { hasResources, BUILD_COSTS } from '@conqueror/shared';

export type InteractionMode = null | 'place_settlement' | 'place_city' | 'place_road' | 'move_bandit';

interface GameStore {
  gameState: PublicGameState | null;
  localPlayerId: string | null;
  chatMessages: Array<{ fromPlayerId: string; username: string; text: string; timestamp: number }>;

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
  boardMode: null,
  roadBuildingEdges: null,
  pendingBanditCoord: null,
  dragPiece: null,
  tradePanel: null,
  tradeSide: 'give',
  _tradeCardCb: null,

  setLocalPlayerId: (id) => set({ localPlayerId: id }),

  resetGame: () => set({
    gameState: null,
    chatMessages: [],
    boardMode: null,
    roadBuildingEdges: null,
    pendingBanditCoord: null,
    dragPiece: null,
    tradePanel: null,
    tradeSide: 'give',
    _tradeCardCb: null,
  }),

  applyGameState: (state) => set(s => {
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

    return {
      gameState: state,
      boardMode: newMode,
      roadBuildingEdges: newRoadBuilding,
      pendingBanditCoord: newPendingBandit,
    };
  }),

  addChatMessage: (msg) => set(s => ({
    chatMessages: [...s.chatMessages, msg].slice(-100),
  })),

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
