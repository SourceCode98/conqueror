import type Database from 'better-sqlite3';
import type {
  GameState,
  PublicGameState,
  PublicPlayerState,
  PlayerColor,
  DevCardType,
} from '@conqueror/shared';
import {
  generateBoard,
  findDesertCoord,
  DEV_CARD_DECK,
  STARTING_SETTLEMENTS,
  STARTING_CITIES,
  STARTING_ROADS,
  EMPTY_RESOURCES,
  checkWinCondition,
} from '@conqueror/shared';

interface GamePlayer {
  id: string;
  username: string;
  color: PlayerColor;
  seat_order: number;
}

export class GameOrchestrator {
  private state: GameState;
  private db: Database.Database;
  private gameId: string;

  constructor(gameId: string, db: Database.Database, players: GamePlayer[], seed?: number) {
    this.gameId = gameId;
    this.db = db;

    const board = generateBoard(seed);
    const banditLocation = findDesertCoord(board);

    // Shuffle dev card deck
    const deck = shuffleDeck([...DEV_CARD_DECK]);

    this.state = {
      gameId,
      phase: 'SETUP_FORWARD',
      turn: 0,
      setupRound: 1,
      activePlayerId: players[0].id,
      players: players.map(p => ({
        id: p.id,
        username: p.username,
        color: p.color,
        resources: { ...EMPTY_RESOURCES },
        devCards: [],
        settlementsLeft: STARTING_SETTLEMENTS,
        citiesLeft: STARTING_CITIES,
        roadsLeft: STARTING_ROADS,
        knightsPlayed: 0,
        hasSupremeArmy: false,
        hasGrandRoad: false,
        victoryPoints: 0,
        victoryPointCards: 0,
        connected: false,
      })),
      board,
      buildings: {},
      roads: {},
      devCardDeck: deck,
      discardedDevCards: [],
      banditLocation,
      diceRoll: null,
      longestRoadLength: 0,
      longestRoadPlayerId: null,
      largestArmySize: 0,
      largestArmyPlayerId: null,
      tradeOffer: null,
      discardsPending: {},
      log: [],
      winner: null,
      turnStartTime: Date.now(),
      turnTimeLimit: null,
      lastAction: null,
    };

    this.persist();
  }

  static loadFromDb(gameId: string, db: Database.Database): GameOrchestrator | null {
    const row = db.prepare('SELECT state_json FROM games WHERE id = ?').get(gameId) as
      | { state_json: string }
      | undefined;
    if (!row?.state_json) return null;

    const inst = Object.create(GameOrchestrator.prototype) as GameOrchestrator;
    inst.gameId = gameId;
    inst.db = db;
    inst.state = JSON.parse(row.state_json);
    return inst;
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * Returns the public-safe game state for a specific player.
   * Hides other players' dev cards and VP card counts.
   */
  getPublicState(forPlayerId?: string): PublicGameState {
    const { devCardDeck, players, ...rest } = this.state;

    const publicPlayers: PublicPlayerState[] = players.map(p => {
      if (p.id === forPlayerId) {
        return {
          ...p,
          devCardCount: p.devCards.length,
          devCards: p.devCards,
          victoryPointCards: p.victoryPointCards,
        };
      }
      return {
        ...p,
        devCardCount: p.devCards.length,
        devCards: undefined,
        victoryPointCards: 0, // hidden
      };
    });

    return {
      ...rest,
      devCardDeckCount: devCardDeck.length,
      players: publicPlayers,
    };
  }

  updateState(updater: (state: GameState) => GameState): void {
    this.state = updater(this.state);
    this.persist();
  }

  setConnected(playerId: string, connected: boolean): void {
    this.state = {
      ...this.state,
      players: this.state.players.map(p =>
        p.id === playerId ? { ...p, connected } : p
      ),
    };
    this.persist();
  }

  addLogEntry(messageKey: string, params?: Record<string, string | number>, playerId?: string): void {
    this.state = {
      ...this.state,
      log: [
        ...this.state.log,
        { timestamp: Date.now(), playerId: playerId ?? null, messageKey, params },
      ],
    };
  }

  private persist(): void {
    this.db.prepare(
      'UPDATE games SET state_json = ?, updated_at = unixepoch() WHERE id = ?'
    ).run(JSON.stringify(this.state), this.gameId);
  }
}

function shuffleDeck(deck: DevCardType[]): DevCardType[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
