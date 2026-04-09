import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import AuthPage from './pages/AuthPage.js';
import LobbyPage from './pages/LobbyPage.js';
import GamePage from './pages/GamePage.js';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);
  if (!token) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/lobby" element={<RequireAuth><LobbyPage /></RequireAuth>} />
      <Route path="/game/:gameId" element={<RequireAuth><GamePage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/lobby" replace />} />
    </Routes>
  );
}
