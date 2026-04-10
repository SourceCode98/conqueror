import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n.js';
import './index.css';
import App from './App.js';
import { useAuthStore } from './store/authStore.js';

// Hydrate auth from localStorage before render
useAuthStore.getState().hydrate();

// StrictMode intentionally double-mounts components, which causes WebSocket
// connections to fire twice and broadcasts duplicate events to all players.
// Keep it off for local multiplayer testing.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
