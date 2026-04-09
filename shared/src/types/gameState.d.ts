import type { ResourceBundle } from './resources.js';
import type { AxialCoord, VertexId, EdgeId, BoardConfig } from './board.js';
export type PlayerColor = 'red' | 'blue' | 'green' | 'orange';
export type BuildingType = 'settlement' | 'city';
export type DevCardType = 'warrior' | 'victoryPoint' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly';
export interface Building {
    type: BuildingType;
    playerId: string;
}
export interface Road {
    playerId: string;
}
export interface DevCard {
    type: DevCardType;
    playedThisTurn: boolean;
    boughtThisTurn: boolean;
}
export interface PlayerState {
    id: string;
    username: string;
    color: PlayerColor;
    resources: ResourceBundle;
    devCards: DevCard[];
    settlementsLeft: number;
    citiesLeft: number;
    roadsLeft: number;
    knightsPlayed: number;
    hasSupremeArmy: boolean;
    hasGrandRoad: boolean;
    victoryPoints: number;
    victoryPointCards: number;
    connected: boolean;
}
export type GamePhase = 'LOBBY' | 'SETUP_FORWARD' | 'SETUP_REVERSE' | 'ROLL' | 'ROBBER' | 'DISCARD' | 'ACTION' | 'TRADE_OFFER' | 'GAME_OVER';
export interface TradeOffer {
    fromPlayerId: string;
    give: ResourceBundle;
    want: ResourceBundle;
    respondents: Record<string, 'pending' | 'accept' | 'reject'>;
}
export interface GameLogEntry {
    timestamp: number;
    playerId: string | null;
    messageKey: string;
    params?: Record<string, string | number>;
}
export interface GameState {
    gameId: string;
    phase: GamePhase;
    turn: number;
    setupRound: number;
    activePlayerId: string;
    players: PlayerState[];
    board: BoardConfig;
    buildings: Record<VertexId, Building>;
    roads: Record<EdgeId, Road>;
    devCardDeck: DevCardType[];
    discardedDevCards: DevCardType[];
    banditLocation: AxialCoord;
    diceRoll: [number, number] | null;
    longestRoadLength: number;
    longestRoadPlayerId: string | null;
    largestArmySize: number;
    largestArmyPlayerId: string | null;
    tradeOffer: TradeOffer | null;
    discardsPending: Record<string, number>;
    log: GameLogEntry[];
    winner: string | null;
}
/**
 * The public-safe version of GameState sent to clients.
 * - devCardDeck is replaced with just a count
 * - victoryPointCards is 0 for all players except the receiving client
 * - devCard types in other players' hands are hidden (count only shown as devCardCount)
 */
export interface PublicPlayerState extends Omit<PlayerState, 'devCards' | 'victoryPointCards'> {
    devCardCount: number;
    devCards?: DevCard[];
    victoryPointCards: number;
}
export interface PublicGameState extends Omit<GameState, 'devCardDeck' | 'players'> {
    devCardDeckCount: number;
    players: PublicPlayerState[];
}
//# sourceMappingURL=gameState.d.ts.map