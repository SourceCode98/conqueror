import type { ResourceBundle } from './resources.js';
import type { AxialCoord, VertexId, EdgeId, BoardConfig } from './board.js';

export type PlayerColor = 'red' | 'blue' | 'green' | 'orange';
export type BuildingType = 'settlement' | 'city';
export type DevCardType =
  | 'warrior'
  | 'victoryPoint'
  | 'roadBuilding'
  | 'yearOfPlenty'
  | 'monopoly';

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
  settlementsLeft: number; // remaining pieces (starts at 5)
  citiesLeft: number;      // remaining pieces (starts at 4)
  roadsLeft: number;       // remaining pieces (starts at 15)
  knightsPlayed: number;
  devCardPlayedThisTurn: boolean;  // true once a dev card is played on the active player's turn
  longestRoadLength: number;       // current longest road for this player (updated each recalculation)
  hasSupremeArmy: boolean;
  hasGrandRoad: boolean;
  victoryPoints: number;       // public VP visible to all
  victoryPointCards: number;   // hidden VP from dev cards (sent only to owner)
  connected: boolean;
}

export type GamePhase =
  | 'LOBBY'
  | 'SETUP_FORWARD'
  | 'SETUP_REVERSE'
  | 'ROLL'
  | 'ROBBER'
  | 'DISCARD'
  | 'ACTION'
  | 'TRADE_OFFER'
  | 'GAME_OVER';

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

export interface LastAction {
  playerId: string;
  username: string;
  type: string;        // e.g. 'builtRoad', 'bankTrade', 'buyDevCard', etc.
  description: string; // human-readable
  timestamp: number;
  highlightEdgeId?: string;
  highlightVertexId?: string;
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  turn: number;
  setupRound: number;             // 1 or 2 during setup phases
  activePlayerId: string;
  players: PlayerState[];         // ordered by seat
  board: BoardConfig;
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, Road>;
  devCardDeck: DevCardType[];     // server only — full ordered deck
  discardedDevCards: DevCardType[];
  banditLocation: AxialCoord;
  diceRoll: [number, number] | null;
  longestRoadLength: number;
  longestRoadPlayerId: string | null;
  largestArmySize: number;
  largestArmyPlayerId: string | null;
  tradeOffer: TradeOffer | null;
  discardsPending: Record<string, number>; // playerId → how many to discard
  log: GameLogEntry[];
  winner: string | null;
  turnStartTime: number | null;    // ms timestamp when current turn started
  turnTimeLimit: number | null;    // seconds per turn, null = no limit
  hornCooldownSecs: number;        // seconds between horn uses per player
  lastAction: LastAction | null;   // last notable action for toasts
}

/**
 * The public-safe version of GameState sent to clients.
 * - devCardDeck is replaced with just a count
 * - victoryPointCards is 0 for all players except the receiving client
 * - devCard types in other players' hands are hidden (count only shown as devCardCount)
 */
export interface PublicPlayerState extends Omit<PlayerState, 'devCards' | 'victoryPointCards'> {
  devCardCount: number;
  devCards?: DevCard[]; // only included for the receiving player
  victoryPointCards: number; // 0 for other players, real value for self
}

export interface PublicGameState extends Omit<GameState, 'devCardDeck' | 'players'> {
  devCardDeckCount: number;
  players: PublicPlayerState[];
}

// Lobby config sent with game start
export interface GameConfig {
  turnTimeLimit: number | null; // seconds, null = no limit
}
