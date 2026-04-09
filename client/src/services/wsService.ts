import type { ClientMessage, ServerMessage } from '@conqueror/shared';
import { useGameStore } from '../store/gameStore.js';

type MessageHandler = (msg: ServerMessage) => void;

class WSService {
  private ws: WebSocket | null = null;
  private messageQueue: ClientMessage[] = [];
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private gameId: string | null = null;
  private token: string | null = null;
  private extraHandlers: MessageHandler[] = [];
  private intentionallyClosed = false;

  connect(gameId: string, token: string): void {
    this.gameId = gameId;
    this.token = token;
    this.intentionallyClosed = false;
    this.openConnection();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.ws?.close();
    this.ws = null;
    this.messageQueue = [];
    this.reconnectDelay = 1000;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.extraHandlers.push(handler);
    return () => {
      this.extraHandlers = this.extraHandlers.filter(h => h !== handler);
    };
  }

  private openConnection(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws`);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // reset on successful connection
      // Join game first
      this.ws!.send(JSON.stringify({
        type: 'JOIN_GAME',
        payload: { gameId: this.gameId, token: this.token },
      }));
      // Drain queued messages
      for (const msg of this.messageQueue) {
        this.ws!.send(JSON.stringify(msg));
      }
      this.messageQueue = [];
    };

    this.ws.onmessage = (e: MessageEvent) => {
      let msg: ServerMessage;
      try { msg = JSON.parse(e.data as string); }
      catch { return; }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      if (this.intentionallyClosed) return;
      setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this.openConnection();
      }, this.reconnectDelay);
    };

    this.ws.onerror = () => {
      // Will trigger onclose
    };
  }

  private handleMessage(msg: ServerMessage): void {
    const store = useGameStore.getState();

    switch (msg.type) {
      case 'GAME_STATE':
        if (msg.payload.state) {
          store.applyGameState(msg.payload.state);
        }
        break;
      case 'CHAT':
        store.addChatMessage(msg.payload);
        break;
    }

    // Notify extra handlers (for components that subscribe directly)
    for (const handler of this.extraHandlers) {
      handler(msg);
    }
  }
}

export const wsService = new WSService();
