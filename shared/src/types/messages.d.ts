import type { ResourceBundle, ResourceType } from './resources.js';
import type { VertexId, EdgeId, AxialCoord } from './board.js';
import type { BuildingType, DevCardType, PublicGameState, TradeOffer } from './gameState.js';
export interface WSMessage<T extends string, P = unknown> {
    type: T;
    payload: P;
    requestId?: string;
}
export interface DevCardParams {
    resources?: [ResourceType, ResourceType];
    resource?: ResourceType;
    edges?: [EdgeId, EdgeId];
}
export type ClientMessage = WSMessage<'JOIN_GAME', {
    gameId: string;
    token: string;
}> | WSMessage<'ROLL_DICE', {
    gameId: string;
}> | WSMessage<'PLACE_BUILDING', {
    gameId: string;
    vertexId: VertexId;
    type: BuildingType;
}> | WSMessage<'PLACE_ROAD', {
    gameId: string;
    edgeId: EdgeId;
}> | WSMessage<'BUY_DEV_CARD', {
    gameId: string;
}> | WSMessage<'PLAY_DEV_CARD', {
    gameId: string;
    cardType: DevCardType;
    params?: DevCardParams;
}> | WSMessage<'BANK_TRADE', {
    gameId: string;
    give: ResourceBundle;
    want: ResourceBundle;
}> | WSMessage<'OFFER_TRADE', {
    gameId: string;
    give: ResourceBundle;
    want: ResourceBundle;
}> | WSMessage<'RESPOND_TRADE', {
    gameId: string;
    response: 'accept' | 'reject';
}> | WSMessage<'ACCEPT_PLAYER_TRADE', {
    gameId: string;
    fromPlayerId: string;
}> | WSMessage<'CANCEL_TRADE', {
    gameId: string;
}> | WSMessage<'COUNTER_TRADE', {
    gameId: string;
    give: ResourceBundle;
    want: ResourceBundle;
}> | WSMessage<'REJECT_COUNTER_OFFER', {
    gameId: string;
    playerId: string;
}> | WSMessage<'MODIFY_OFFER_GIVE', {
    gameId: string;
    give: ResourceBundle;
}> | WSMessage<'MOVE_BANDIT', {
    gameId: string;
    coord: AxialCoord;
    stealFromPlayerId?: string;
}> | WSMessage<'DISCARD_CARDS', {
    gameId: string;
    cards: ResourceBundle;
}> | WSMessage<'END_TURN', {
    gameId: string;
}> | WSMessage<'CHAT', {
    gameId: string;
    text: string;
}>;
export type ServerMessage = WSMessage<'ERROR', {
    code: string;
    message: string;
    requestId?: string;
}> | WSMessage<'GAME_STATE', {
    state: PublicGameState;
}> | WSMessage<'DICE_ROLLED', {
    roll: [number, number];
    resources: Record<string, ResourceBundle>;
}> | WSMessage<'DEV_CARD_DRAWN', {
    cardType: DevCardType;
}> | WSMessage<'TRADE_OFFERED', {
    offer: TradeOffer;
}> | WSMessage<'TRADE_RESOLVED', {
    accepted: boolean;
    byPlayerId?: string;
}> | WSMessage<'GAME_OVER', {
    winnerId: string;
    finalScores: Record<string, number>;
}> | WSMessage<'CHAT', {
    fromPlayerId: string;
    username: string;
    text: string;
    timestamp: number;
}> | WSMessage<'PLAYER_CONNECTED', {
    playerId: string;
}> | WSMessage<'PLAYER_DISCONNECTED', {
    playerId: string;
}>;
//# sourceMappingURL=messages.d.ts.map