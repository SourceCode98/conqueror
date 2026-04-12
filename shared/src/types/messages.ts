import type { ResourceBundle, ResourceType } from './resources.js';
import type { VertexId, EdgeId, AxialCoord } from './board.js';
import type { BuildingType, DevCardType, PublicGameState, TradeOffer } from './gameState.js';

// ─── Base ─────────────────────────────────────────────────────────────────────

export interface WSMessage<T extends string, P = unknown> {
  type: T;
  payload: P;
  requestId?: string;
}

// ─── Client → Server ──────────────────────────────────────────────────────────

export interface DevCardParams {
  resources?: [ResourceType, ResourceType]; // yearOfPlenty
  resource?: ResourceType;                  // monopoly
  edges?: [EdgeId, EdgeId];                 // roadBuilding
}

export type ClientMessage =
  | WSMessage<'JOIN_GAME',           { gameId: string; token: string }>
  | WSMessage<'ROLL_DICE',           { gameId: string }>
  | WSMessage<'PLACE_BUILDING',      { gameId: string; vertexId: VertexId; type: BuildingType }>
  | WSMessage<'PLACE_ROAD',          { gameId: string; edgeId: EdgeId }>
  | WSMessage<'BUY_DEV_CARD',        { gameId: string }>
  | WSMessage<'PLAY_DEV_CARD',       { gameId: string; cardType: DevCardType; params?: DevCardParams }>
  | WSMessage<'BANK_TRADE',          { gameId: string; give: ResourceBundle; want: ResourceBundle }>
  | WSMessage<'OFFER_TRADE',         { gameId: string; give: ResourceBundle; want: ResourceBundle }>
  | WSMessage<'RESPOND_TRADE',       { gameId: string; response: 'accept' | 'reject' }>
  | WSMessage<'ACCEPT_PLAYER_TRADE', { gameId: string; fromPlayerId: string }>
  | WSMessage<'CANCEL_TRADE',        { gameId: string }>
  | WSMessage<'COUNTER_TRADE',       { gameId: string; give: ResourceBundle; want: ResourceBundle }>
  | WSMessage<'MOVE_BANDIT',         { gameId: string; coord: AxialCoord; stealFromPlayerId?: string }>
  | WSMessage<'DISCARD_CARDS',       { gameId: string; cards: ResourceBundle }>
  | WSMessage<'END_TURN',            { gameId: string }>
  | WSMessage<'FORCE_END_TURN',      { gameId: string }>
  | WSMessage<'END_GAME',            { gameId: string }>
  | WSMessage<'CHAT',                { gameId: string; text: string }>
  | WSMessage<'HORN',                { gameId: string }>
  | WSMessage<'PLAY_AGAIN_VOTE',     { gameId: string; accept: boolean }>
  | WSMessage<'RECRUIT_SOLDIER',    { gameId: string; vertexId: VertexId }>
  | WSMessage<'ATTACK',             { gameId: string; targetVertexId: VertexId; soldiers: number }>
  | WSMessage<'COMBAT_ROLL',        { gameId: string }>
  | WSMessage<'CHOOSE_DESTRUCTION', { gameId: string; destructionType: 'destroy' | 'downgrade' }>
  | WSMessage<'RECONSTRUCT',        { gameId: string; vertexId: VertexId }>;

// ─── Server → Client ──────────────────────────────────────────────────────────

export type ServerMessage =
  | WSMessage<'ERROR',               { code: string; message: string; requestId?: string }>
  | WSMessage<'GAME_STATE',          { state: PublicGameState }>
  | WSMessage<'DICE_ROLLED',         { roll: [number, number]; resources: Record<string, ResourceBundle> }>
  | WSMessage<'DEV_CARD_DRAWN',      { cardType: DevCardType }>
  | WSMessage<'TRADE_OFFERED',       { offer: TradeOffer }>
  | WSMessage<'TRADE_RESOLVED',      { accepted: boolean; byPlayerId?: string }>
  | WSMessage<'GAME_OVER',           { winnerId: string; finalScores: Record<string, number> }>
  | WSMessage<'CHAT',                { fromPlayerId: string; username: string; text: string; timestamp: number }>
  | WSMessage<'PLAYER_CONNECTED',    { playerId: string }>
  | WSMessage<'PLAYER_DISCONNECTED', { playerId: string }>
  | WSMessage<'BANK_TRADE_EXECUTED', { playerId: string; username: string; give: ResourceBundle; want: ResourceBundle }>
  | WSMessage<'HORN_PLAYED',         { fromPlayerId: string; username: string }>
  | WSMessage<'ACTION_TOAST',        { playerId: string; username: string; action: string; extra?: string }>
  | WSMessage<'PLAY_AGAIN_POLL',     { votes: Record<string, boolean | null>; secondsLeft: number }>
  | WSMessage<'PLAY_AGAIN_START',    { newGameId: string }>
  | WSMessage<'GAME_CLOSED',         { reason: string }>
  | WSMessage<'COMBAT_DICE_PHASE',   { attackerId: string; defenderId: string; attackerName: string; defenderName: string; timeoutSecs: number }>
  | WSMessage<'COMBAT_DIE_REVEALED', { side: 'attacker' | 'defender'; value: number }>
  | WSMessage<'COMBAT_RESULT',       { attackerForce: number; defenderForce: number; attackerWon: boolean; effect: 'siege' | 'destruction_choice' | 'repelled'; attackerName: string; defenderName: string; attackerDie: number; defenderDie: number; attackSoldiers: number; defenderSoldiers: number; cityBonus: number; garrisonBonus: number }>;
