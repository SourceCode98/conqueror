import db from '../db/index.js';
import { GameOrchestrator } from '../game/GameOrchestrator.js';
import { registerOrchestrator } from '../game/orchestratorRegistry.js';
import { broadcastToRoom } from './wsServer.js';

interface GamePlayer {
  id: string;
  username: string;
  color: string;
  seat_order: number;
}

export function startGame(gameId: string, players: GamePlayer[]): GameOrchestrator {
  const orch = new GameOrchestrator(
    gameId,
    db,
    players.map(p => ({ ...p, color: p.color as any })),
  );
  registerOrchestrator(gameId, orch);

  // Broadcast game state to all connected players
  broadcastToRoom(gameId, {
    type: 'GAME_STATE',
    payload: { state: orch.getPublicState() },
  });

  return orch;
}
