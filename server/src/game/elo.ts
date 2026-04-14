export interface EloResult {
  userId: string;
  oldElo: number;
  newElo: number;
  delta: number;
}

function expected(rA: number, rB: number): number {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function kFactor(elo: number): number {
  if (elo < 1200) return 32;
  if (elo < 1400) return 24;
  return 16;
}

export interface PlayerForElo {
  userId: string;
  elo: number;
  won: boolean;
  victoryPoints: number;
}

/**
 * Multiplayer ELO: each pair of players is treated as a 1v1 match.
 * Winner beats all. Among non-winners, higher VP wins the matchup.
 */
export function calculateEloChanges(players: PlayerForElo[]): EloResult[] {
  if (players.length < 2) return [];

  const deltas = new Array(players.length).fill(0);

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const pi = players[i];
      const pj = players[j];

      let si: number, sj: number;
      if (pi.won && !pj.won)       { si = 1;   sj = 0; }
      else if (!pi.won && pj.won)  { si = 0;   sj = 1; }
      else if (pi.victoryPoints > pj.victoryPoints) { si = 1;   sj = 0; }
      else if (pi.victoryPoints < pj.victoryPoints) { si = 0;   sj = 1; }
      else                         { si = 0.5; sj = 0.5; }

      deltas[i] += kFactor(pi.elo) * (si - expected(pi.elo, pj.elo));
      deltas[j] += kFactor(pj.elo) * (sj - expected(pj.elo, pi.elo));
    }
  }

  return players.map((p, i) => ({
    userId: p.userId,
    oldElo: p.elo,
    newElo: Math.max(100, Math.round(p.elo + deltas[i])),
    delta: Math.round(deltas[i]),
  }));
}
