import db from '../db/index.js';
import { GameOrchestrator } from '../game/GameOrchestrator.js';
import { registerOrchestrator } from '../game/orchestratorRegistry.js';
import { broadcastPersonalizedGameState, getConnectedUserIds } from './wsServer.js';

interface GamePlayer {
  id: string;
  username: string;
  color: string;
  seat_order: number;
}

export function startGame(
  gameId: string,
  players: GamePlayer[],
  turnTimeLimit: number | null = null,
  hornCooldownSecs: number = 30,
  warMode: boolean = false,
  warVariants: { totalWar?: boolean; fortress?: boolean; reconstruction?: boolean } = {},
): GameOrchestrator {
  const orch = new GameOrchestrator(
    gameId,
    db,
    players.map(p => ({ ...p, color: p.color as any })),
    undefined,
    turnTimeLimit,
    hornCooldownSecs,
    warMode,
    warVariants,
  );
  registerOrchestrator(gameId, orch);

  // Mark players already in the WS room as connected before the first broadcast
  // (they joined via WebSocket during the lobby phase but connected: false is the default)
  const connectedIds = getConnectedUserIds(gameId);
  for (const id of connectedIds) {
    orch.setConnected(id, true);
  }

  // Broadcast personalised game state to each connected player
  broadcastPersonalizedGameState(gameId, orch);

  return orch;
}
