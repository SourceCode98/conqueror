import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore.js';
import { useProfileStore } from '../store/profileStore.js';
import LanguageSwitcher from '../components/LanguageSwitcher.js';
import { PLAYER_COLOR_OPTIONS } from '@conqueror/shared';
import { cn } from '../lib/cn.js';

// ─── ELO tier system ─────────────────────────────────────────────────────────
const TIERS = [
  { min: 0,    max: 999,   name: 'Bronze',   icon: '🥉', color: '#cd7f32', next: 1000 },
  { min: 1000, max: 1199,  name: 'Silver',   icon: '🥈', color: '#c0c0c0', next: 1200 },
  { min: 1200, max: 1399,  name: 'Gold',     icon: '🥇', color: '#ffd700', next: 1400 },
  { min: 1400, max: 1599,  name: 'Platinum', icon: '💎', color: '#a0ffe8', next: 1600 },
  { min: 1600, max: 99999, name: 'Diamond',  icon: '👑', color: '#a8d8ff', next: null },
];
function getTier(elo: number) {
  return TIERS.find(t => elo >= t.min && elo <= t.max) ?? TIERS[0];
}

// ─── Color picker ─────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange, takenColors = [] }: {
  value: string; onChange: (c: string) => void; takenColors?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PLAYER_COLOR_OPTIONS.map(c => {
        const taken = takenColors.includes(c);
        return (
          <button
            key={c} disabled={taken} onClick={() => onChange(c)}
            title={taken ? 'Taken' : c}
            className={cn(
              'w-7 h-7 rounded-full border-2 transition-all',
              value === c ? 'border-white scale-110 shadow-lg' : 'border-transparent',
              taken ? 'opacity-25 cursor-not-allowed' : 'hover:scale-105',
            )}
            style={{ backgroundColor: c }}
          />
        );
      })}
    </div>
  );
}

// ─── Game listing type ────────────────────────────────────────────────────────
interface GameListing {
  id: string; name: string; status: string;
  max_players: number; player_count: number; created_by_username: string;
}

// ─── Profile card ─────────────────────────────────────────────────────────────
function ProfileCard({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuthStore();
  const profile = useProfileStore(s => s.profile);
  const elo = profile?.elo ?? user?.elo ?? 1000;
  const tier = getTier(elo);
  const winRate = profile && profile.gamesPlayed > 0
    ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100)
    : 0;
  const progressPct = tier.next
    ? Math.round(((elo - tier.min) / (tier.next - tier.min)) * 100)
    : 100;
  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase();

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black shrink-0"
          style={{ background: `${tier.color}22`, border: `2px solid ${tier.color}66`, color: tier.color }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-black text-white text-lg leading-tight truncate">{user?.username}</p>
          <p className="text-xs font-bold" style={{ color: tier.color }}>
            {tier.icon} {tier.name}
          </p>
        </div>
      </div>

      {/* ELO */}
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-gray-400 text-xs font-bold tracking-wider">ELO</span>
          <span className="font-black text-2xl" style={{ color: tier.color }}>{elo}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: tier.color, boxShadow: `0 0 8px ${tier.color}88` }}
          />
        </div>
        {tier.next && (
          <p className="text-[10px] text-gray-600 mt-0.5 text-right">{tier.next - elo} to {TIERS[TIERS.indexOf(tier) + 1]?.name}</p>
        )}
      </div>

      {/* Stats */}
      {profile && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Games', value: profile.gamesPlayed },
            { label: 'Wins',  value: profile.gamesWon },
            { label: 'Win %', value: `${winRate}%` },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-white font-black text-base leading-none">{s.value}</p>
              <p className="text-gray-500 text-[10px] mt-0.5 font-bold tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 mt-auto">
        <LanguageSwitcher />
        <button
          onClick={onLogout}
          className="flex-1 text-xs text-gray-400 hover:text-white transition-colors py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LobbyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, user, logout } = useAuthStore();
  const { profile, fetchProfile } = useProfileStore();

  const [games, setGames] = useState<GameListing[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [color, setColor] = useState<string>(PLAYER_COLOR_OPTIONS[0]);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [joiningGameId, setJoiningGameId] = useState<string | null>(null);
  const [joinColor, setJoinColor] = useState<string>(PLAYER_COLOR_OPTIONS[0]);
  const [joinTakenColors, setJoinTakenColors] = useState<string[]>([]);

  // Refresh profile when returning to lobby (e.g. after a game)
  useEffect(() => {
    if (token) fetchProfile(token);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchGames() {
    const res = await fetch('/api/games', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setGames(await res.json());
  }

  useEffect(() => {
    fetchGames();
    const iv = setInterval(fetchGames, 5000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createGame() {
    if (!newGameName.trim()) { setCreateError('Enter a game name'); return; }
    setCreateError('');
    setCreating(true);
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newGameName.trim(), maxPlayers, color }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(data.error); return; }
    navigate(`/game/${data.gameId}`);
  }

  async function openJoin(gameId: string) {
    const res = await fetch(`/api/games/${gameId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      const taken: string[] = (data.players ?? []).map((p: any) => p.color);
      setJoinTakenColors(taken);
      setJoinColor(PLAYER_COLOR_OPTIONS.find(c => !taken.includes(c)) ?? PLAYER_COLOR_OPTIONS[0]);
    }
    setJoiningGameId(gameId);
  }

  async function confirmJoin() {
    if (!joiningGameId) return;
    const res = await fetch(`/api/games/${joiningGameId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ color: joinColor }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    navigate(`/game/${joiningGameId}`);
  }

  const lobbyGames  = games.filter(g => g.status === 'lobby');
  const activeGames = games.filter(g => g.status === 'active');

  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ background: 'radial-gradient(ellipse at 50% 0%, #1a1205 0%, #0a0a0f 60%)' }}>
      {/* Header */}
      <div className="border-b border-white/5 px-4 py-3 flex items-center justify-center">
        <h1 className="text-2xl font-black tracking-widest" style={{ color: '#f59e0b', textShadow: '0 0 20px #f59e0b44' }}>
          ⚔️ CONQUEROR
        </h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

        {/* ── Left: Profile card ── */}
        <div className="w-full lg:w-64 shrink-0">
          <ProfileCard onLogout={logout} />
        </div>

        {/* ── Right: Games panel ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Create game button / form */}
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-3 rounded-xl font-black text-sm tracking-wider transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #b45309, #d97706)',
                boxShadow: '0 4px 20px rgba(180,83,9,0.4)',
              }}
            >
              + {t('createGame')}
            </button>
          ) : (
            <div
              className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-amber-400">{t('createGame')}</h3>
                <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-bold tracking-wide">{t('gameName')}</label>
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50 transition-colors"
                    value={newGameName}
                    onChange={e => setNewGameName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createGame()}
                    placeholder="My game…"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-bold tracking-wide">{t('maxPlayers')}</label>
                  <select
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
                    value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                  >
                    {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} players</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-bold tracking-wide">{t('color')}</label>
                  <ColorPicker value={color} onChange={setColor} />
                </div>
                {createError && <p className="text-red-400 text-xs">{createError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={createGame} disabled={creating}
                    className="flex-1 py-2 rounded-lg font-black text-sm transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #b45309, #d97706)' }}
                  >
                    {creating ? '…' : t('createGame')}
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setCreateError(''); }}
                    className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Game sections */}
          {games.length === 0 && (
            <div className="text-center py-12 text-gray-600">
              <p className="text-4xl mb-3">🏟️</p>
              <p className="font-bold">No games yet</p>
              <p className="text-sm mt-1">Create one to get started</p>
            </div>
          )}

          {lobbyGames.length > 0 && (
            <div>
              <p className="text-xs font-black tracking-widest text-gray-500 mb-2 px-1">OPEN GAMES</p>
              <div className="space-y-2">
                {lobbyGames.map(game => (
                  <GameRow
                    key={game.id}
                    game={game}
                    joiningId={joiningGameId}
                    joinColor={joinColor}
                    joinTakenColors={joinTakenColors}
                    onJoin={() => joiningGameId === game.id ? setJoiningGameId(null) : openJoin(game.id)}
                    onColorChange={setJoinColor}
                    onConfirmJoin={confirmJoin}
                  />
                ))}
              </div>
            </div>
          )}

          {activeGames.length > 0 && (
            <div>
              <p className="text-xs font-black tracking-widest text-gray-500 mb-2 px-1">IN PROGRESS</p>
              <div className="space-y-2">
                {activeGames.map(game => (
                  <GameRow
                    key={game.id}
                    game={game}
                    joiningId={null}
                    joinColor=""
                    joinTakenColors={[]}
                    onJoin={() => navigate(`/game/${game.id}`)}
                    onColorChange={() => {}}
                    onConfirmJoin={() => {}}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Game row ─────────────────────────────────────────────────────────────────
function GameRow({ game, joiningId, joinColor, joinTakenColors, onJoin, onColorChange, onConfirmJoin }: {
  game: GameListing;
  joiningId: string | null;
  joinColor: string;
  joinTakenColors: string[];
  onJoin: () => void;
  onColorChange: (c: string) => void;
  onConfirmJoin: () => void;
}) {
  const isJoining = joiningId === game.id;
  const isFull    = game.player_count >= game.max_players;
  const isActive  = game.status === 'active';

  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-white truncate">{game.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {game.player_count}/{game.max_players} players · by {game.created_by_username}
            {isActive && <span className="ml-2 text-green-400 font-bold">● live</span>}
          </p>
        </div>

        {isActive ? (
          <button
            onClick={onJoin}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-green-300 transition-colors hover:bg-green-400/10"
            style={{ border: '1px solid rgba(74,222,128,0.3)' }}
          >
            Rejoin
          </button>
        ) : !isFull ? (
          <button
            onClick={onJoin}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
              isJoining
                ? 'text-gray-400 hover:text-white'
                : 'text-amber-300 hover:bg-amber-400/10',
            )}
            style={{ border: `1px solid ${isJoining ? 'rgba(255,255,255,0.1)' : 'rgba(251,191,36,0.3)'}` }}
          >
            {isJoining ? 'Cancel' : 'Join'}
          </button>
        ) : (
          <span className="text-xs text-gray-600 font-bold shrink-0">Full</span>
        )}
      </div>

      {/* Inline join panel */}
      {isJoining && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-2 font-bold">Pick your color</p>
            <ColorPicker value={joinColor} onChange={onColorChange} takenColors={joinTakenColors} />
          </div>
          <button
            onClick={onConfirmJoin}
            className="w-full py-2 rounded-lg text-sm font-black transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #b45309, #d97706)' }}
          >
            Join Game
          </button>
        </div>
      )}
    </div>
  );
}
