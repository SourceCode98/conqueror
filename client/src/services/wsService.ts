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
  // Dedup: key → timestamp of last processing (prevents double-fire from reconnects)
  private recentKeys = new Map<string, number>();

  private isDup(key: string, windowMs = 800): boolean {
    const now = Date.now();
    const last = this.recentKeys.get(key) ?? 0;
    if (now - last < windowMs) return true;
    this.recentKeys.set(key, now);
    return false;
  }

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
      case 'CHAT': {
        store.addChatMessage(msg.payload);
        // Show toast for messages from other players
        const localId = store.localPlayerId;
        if (msg.payload.fromPlayerId !== localId) {
          const key = `chat:${msg.payload.fromPlayerId}:${msg.payload.timestamp}`;
          if (!this.isDup(key, 2000)) {
            store.addToast({
              type: 'chat',
              playerId: msg.payload.fromPlayerId,
              username: msg.payload.username,
              data: { text: msg.payload.text },
            });
          }
        }
        break;
      }
      case 'DICE_ROLLED': {
        const { roll, resources } = msg.payload;
        const total = roll[0] + roll[1];
        if (!this.isDup(`dice:${roll[0]}:${roll[1]}`)) {
          store.addToast({
            type: 'dice_resources',
            playerId: '__dice__',
            username: '',
            data: { roll, resources: total === 7 ? {} : resources },
          });
        }
        break;
      }
      case 'BANK_TRADE_EXECUTED': {
        const key = `bank:${msg.payload.playerId}:${JSON.stringify(msg.payload.give)}`;
        if (!this.isDup(key)) {
          store.addToast({
            type: 'bank_trade',
            playerId: msg.payload.playerId,
            username: msg.payload.username,
            data: { give: msg.payload.give, want: msg.payload.want },
          });
        }
        break;
      }
      case 'HORN_PLAYED':
        if (!this.isDup(`horn:${msg.payload.fromPlayerId}`)) {
          store.addToast({
            type: 'horn',
            playerId: msg.payload.fromPlayerId,
            username: msg.payload.username,
            data: {},
          });
        }
        break;
      case 'ACTION_TOAST': {
        const key = `action:${msg.payload.playerId}:${msg.payload.action}:${msg.payload.extra ?? ''}`;
        if (!this.isDup(key)) {
          store.addToast({
            type: 'action',
            playerId: msg.payload.playerId,
            username: msg.payload.username,
            data: { action: msg.payload.action, extra: msg.payload.extra },
          });
        }
        break;
      }
      case 'GAME_OVER': {
        store.setFinalScores(msg.payload.finalScores);
        break;
      }
    }

    // Notify extra handlers (for components that subscribe directly)
    for (const handler of this.extraHandlers) {
      handler(msg);
    }
  }
}

export const wsService = new WSService();
