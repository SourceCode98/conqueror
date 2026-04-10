import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore.js';
import LanguageSwitcher from '../components/LanguageSwitcher.js';
import { PLAYER_COLOR_OPTIONS } from '@conqueror/shared';
import { cn } from '../lib/cn.js';

interface GameListing {
  id: string;
  name: string;
  status: string;
  max_players: number;
  player_count: number;
  created_by_username: string;
}

function ColorPicker({
  value,
  onChange,
  takenColors = [],
}: {
  value: string;
  onChange: (c: string) => void;
  takenColors?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PLAYER_COLOR_OPTIONS.map(c => {
        const taken = takenColors.includes(c);
        const selected = value === c;
        return (
          <button
            key={c}
            disabled={taken}
            onClick={() => onChange(c)}
            title={taken ? 'Already taken' : c}
            className={cn(
              'w-8 h-8 rounded-full border-2 transition-all',
              selected ? 'border-white scale-110 shadow-lg' : 'border-transparent',
              taken ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:scale-105',
            )}
            style={{ backgroundColor: c }}
          />
        );
      })}
    </div>
  );
}

export default function LobbyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, user, logout } = useAuthStore();
  const [games, setGames] = useState<GameListing[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [color, setColor] = useState<string>(PLAYER_COLOR_OPTIONS[0]);
  const [error, setError] = useState('');
  // Join state: which game is being joined + color picker
  const [joiningGameId, setJoiningGameId] = useState<string | null>(null);
  const [joinColor, setJoinColor] = useState<string>(PLAYER_COLOR_OPTIONS[0]);
  const [joinTakenColors, setJoinTakenColors] = useState<string[]>([]);

  async function fetchGames() {
    const res = await fetch('/api/games', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setGames(await res.json());
  }

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, []);

  async function createGame() {
    setError('');
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newGameName, maxPlayers, color }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    navigate(`/game/${data.gameId}`);
  }

  async function openJoin(gameId: string) {
    // Fetch taken colors for this game
    const res = await fetch(`/api/games/${gameId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      const taken: string[] = (data.players ?? []).map((p: any) => p.color);
      setJoinTakenColors(taken);
      // Pick first available color
      const first = PLAYER_COLOR_OPTIONS.find(c => !taken.includes(c)) ?? PLAYER_COLOR_OPTIONS[0];
      setJoinColor(first);
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

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-amber-400">{t('appName')}</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">{user?.username}</span>
            <LanguageSwitcher />
            <button className="btn-secondary text-sm" onClick={logout}>{t('logout')}</button>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{t('lobby')}</h2>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>{t('createGame')}</button>
        </div>

        {showCreate && (
          <div className="card mb-4">
            <h3 className="font-semibold mb-3">{t('createGame')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('gameName')}</label>
                <input className="input" value={newGameName} onChange={e => setNewGameName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('maxPlayers')}</label>
                <select className="input" value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}>
                  {[2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('color')}</label>
                <ColorPicker value={color} onChange={setColor}/>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={createGame}>{t('createGame')}</button>
                <button className="btn-secondary" onClick={() => setShowCreate(false)}>{t('cancel')}</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {games.length === 0 && (
            <p className="text-gray-500 text-center py-8">No games available. Create one!</p>
          )}
          {games.map(game => (
            <div key={game.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{game.name}</p>
                  <p className="text-sm text-gray-400">
                    {t('players')}: {game.player_count}/{game.max_players} · {game.created_by_username}
                  </p>
                </div>
                {game.status === 'lobby' && game.player_count < game.max_players && (
                  <button
                    className="btn-primary text-sm"
                    onClick={() => joiningGameId === game.id ? setJoiningGameId(null) : openJoin(game.id)}
                  >
                    {joiningGameId === game.id ? 'Cancel' : t('joinGame')}
                  </button>
                )}
                {game.status === 'active' && (
                  <button className="btn-secondary text-sm" onClick={() => navigate(`/game/${game.id}`)}>
                    Spectate / Rejoin
                  </button>
                )}
              </div>

              {/* Inline join color picker */}
              {joiningGameId === game.id && (
                <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                  <p className="text-sm text-gray-400">Pick your color:</p>
                  <ColorPicker value={joinColor} onChange={setJoinColor} takenColors={joinTakenColors}/>
                  <button className="btn-primary w-full text-sm" onClick={confirmJoin}>
                    Join with this color
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
