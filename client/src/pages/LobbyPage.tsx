import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore.js';
import LanguageSwitcher from '../components/LanguageSwitcher.js';

const PLAYER_COLORS = ['red', 'blue', 'green', 'orange'] as const;

interface GameListing {
  id: string;
  name: string;
  status: string;
  max_players: number;
  player_count: number;
  created_by_username: string;
}

export default function LobbyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, user, logout } = useAuthStore();
  const [games, setGames] = useState<GameListing[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [color, setColor] = useState<string>('red');
  const [error, setError] = useState('');

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

  async function joinGame(gameId: string, selectedColor: string) {
    const res = await fetch(`/api/games/${gameId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ color: selectedColor }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return; }
    navigate(`/game/${gameId}`);
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
                <div className="flex gap-2">
                  {PLAYER_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c === 'red' ? '#ef4444' : c === 'blue' ? '#3b82f6' : c === 'green' ? '#22c55e' : '#f97316' }}
                    />
                  ))}
                </div>
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
            <div key={game.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium">{game.name}</p>
                <p className="text-sm text-gray-400">
                  {t('players')}: {game.player_count}/{game.max_players} · {game.created_by_username}
                </p>
              </div>
              {game.status === 'lobby' && game.player_count < game.max_players && (
                <button
                  className="btn-primary text-sm"
                  onClick={() => {
                    const c = prompt('Choose color: red, blue, green, orange') ?? 'blue';
                    joinGame(game.id, c);
                  }}
                >
                  {t('joinGame')}
                </button>
              )}
              {game.status === 'active' && (
                <button className="btn-secondary text-sm" onClick={() => navigate(`/game/${game.id}`)}>
                  Spectate / Rejoin
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
