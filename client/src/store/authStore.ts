import { create } from 'zustand';
import { useProfileStore } from './profileStore.js';

interface User {
  id: string;
  username: string;
  elo?: number;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

// ── Token expiry helpers ──────────────────────────────────────────────────────

function getTokenExp(token: string): number | null {
  try {
    const raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(raw));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = getTokenExp(token);
  return exp === null || exp * 1000 <= Date.now();
}

let _logoutTimer: ReturnType<typeof setTimeout> | null = null;
let _visibilityHandler: (() => void) | null = null;

function scheduleExpiry(token: string) {
  // Clear any existing timer + listener
  if (_logoutTimer) { clearTimeout(_logoutTimer); _logoutTimer = null; }
  if (_visibilityHandler) {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }

  const exp = getTokenExp(token);
  if (!exp) return;

  const doLogout = () => useAuthStore.getState().logout();

  const msLeft = exp * 1000 - Date.now();
  if (msLeft <= 0) { doLogout(); return; }

  // setTimeout is unreliable for long durations on backgrounded tabs,
  // so also check on visibility restore.
  _logoutTimer = setTimeout(doLogout, msLeft);

  _visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      const t = useAuthStore.getState().token;
      if (t && isTokenExpired(t)) doLogout();
    }
  };
  document.addEventListener('visibilitychange', _visibilityHandler);
}

function clearExpiry() {
  if (_logoutTimer) { clearTimeout(_logoutTimer); _logoutTimer = null; }
  if (_visibilityHandler) {
    document.removeEventListener('visibilitychange', _visibilityHandler);
    _visibilityHandler = null;
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,

  hydrate: () => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      // Reject already-expired tokens immediately
      if (isTokenExpired(token)) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return;
      }
      try {
        set({ token, user: JSON.parse(user) });
        useProfileStore.getState().fetchProfile(token);
        scheduleExpiry(token);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  },

  login: async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Login failed');
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ token: data.token, user: data.user });
    useProfileStore.getState().fetchProfile(data.token);
    scheduleExpiry(data.token);
  },

  register: async (username, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Registration failed');
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ token: data.token, user: data.user });
    useProfileStore.getState().fetchProfile(data.token);
    scheduleExpiry(data.token);
  },

  logout: () => {
    clearExpiry();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },
}));
