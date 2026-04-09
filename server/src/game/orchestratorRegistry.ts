import { GameOrchestrator } from './GameOrchestrator.js';
import db from '../db/index.js';

const orchestrators = new Map<string, GameOrchestrator>();

export function registerOrchestrator(gameId: string, orch: GameOrchestrator): void {
  orchestrators.set(gameId, orch);
}

export function getOrchestrator(gameId: string): GameOrchestrator | null {
  if (orchestrators.has(gameId)) return orchestrators.get(gameId)!;
  // Try loading from DB
  const orch = GameOrchestrator.loadFromDb(gameId, db);
  if (orch) orchestrators.set(gameId, orch);
  return orch;
}
