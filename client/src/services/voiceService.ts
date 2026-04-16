/**
 * Push-to-talk voice chat via WebSocket relay.
 * Hold PTT → MediaRecorder captures the full press duration as one blob →
 * release PTT → complete self-contained webm sent → receiver decodes once.
 * Only one person can talk at a time (server enforced).
 */
import { wsService } from './wsService.js';

export interface VoicePeer {
  playerId: string;
  username: string;
  talking: boolean;
}

type StateListener = (
  peers: VoicePeer[],
  inVoice: boolean,
  pttActive: boolean,
  talkingPeerId: string | null,
) => void;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── Service ───────────────────────────────────────────────────────────────────

class VoiceService {
  private gameId: string | null = null;
  private localStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private mimeType = 'audio/webm;codecs=opus';

  private inVoice = false;
  private pttActive = false;
  private talkingPeerId: string | null = null;   // peer currently holding PTT

  private listeners: StateListener[] = [];
  private wsUnsub: (() => void) | null = null;
  private peerMeta = new Map<string, { username: string; talking: boolean }>();

  // Playback
  private audioCtx: AudioContext | null = null;
  private nextPlayTime = new Map<string, number>();

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  init(gameId: string) {
    this.gameId = gameId;
    this.wsUnsub = wsService.onMessage(msg => this.handleServerMsg(msg as any));
  }

  destroy() {
    this.leave();
    this.wsUnsub?.();
    this.wsUnsub = null;
    this.gameId = null;
    this.listeners = [];
  }

  subscribe(fn: StateListener) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  getState() {
    return {
      peers: this.buildPeerList(),
      inVoice: this.inVoice,
      pttActive: this.pttActive,
      talkingPeerId: this.talkingPeerId,
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async join() {
    if (this.inVoice || !this.gameId) return;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      alert('Could not access microphone.');
      return;
    }
    this.mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    this.inVoice = true;
    // Create and unlock AudioContext now, while we're inside a user gesture
    this.getAudioCtx().resume().catch(() => {});
    wsService.send({ type: 'VOICE_JOIN', payload: { gameId: this.gameId } });
    this.notify();
  }

  leave() {
    if (!this.inVoice || !this.gameId) return;
    this.stopPTT();
    wsService.send({ type: 'VOICE_LEAVE', payload: { gameId: this.gameId } });
    this.cleanup();
  }

  /** Called on pointerdown of PTT button */
  startPTT() {
    if (!this.inVoice || !this.gameId || this.pttActive || this.talkingPeerId !== null) return;
    if (!this.localStream) return;

    this.pttActive = true;

    this.recorder = new MediaRecorder(this.localStream, {
      mimeType: this.mimeType,
      audioBitsPerSecond: 32000,
    });

    this.recorder.ondataavailable = async (e) => {
      if (e.data.size === 0 || !this.gameId) return;
      // Complete self-contained webm blob — no header tricks needed
      const data = toBase64(await e.data.arrayBuffer());
      wsService.send({ type: 'VOICE_AUDIO', payload: { gameId: this.gameId, data } });
    };

    this.recorder.start();
    wsService.send({ type: 'VOICE_PTT_START', payload: { gameId: this.gameId } });
    this.notify();
  }

  /** Called on pointerup / pointercancel of PTT button */
  stopPTT() {
    if (!this.pttActive || !this.gameId) return;
    this.pttActive = false;
    this.recorder?.stop();   // triggers ondataavailable with the full blob
    this.recorder = null;
    wsService.send({ type: 'VOICE_PTT_END', payload: { gameId: this.gameId } });
    this.notify();
  }

  // ── Server messages ─────────────────────────────────────────────────────────

  private handleServerMsg(msg: { type: string; payload: any }) {
    switch (msg.type) {
      case 'VOICE_PEERS': {
        this.peerMeta.clear();
        for (const p of msg.payload.peers as Array<{ playerId: string; username: string }>) {
          this.peerMeta.set(p.playerId, { username: p.username, talking: false });
        }
        this.notify();
        break;
      }
      case 'VOICE_PEER_JOINED': {
        this.peerMeta.set(msg.payload.playerId, { username: msg.payload.username, talking: false });
        this.notify();
        break;
      }
      case 'VOICE_PEER_LEFT': {
        this.peerMeta.delete(msg.payload.playerId);
        if (this.talkingPeerId === msg.payload.playerId) this.talkingPeerId = null;
        this.nextPlayTime.delete(msg.payload.playerId);
        this.notify();
        break;
      }
      case 'VOICE_PEER_TALKING': {
        const meta = this.peerMeta.get(msg.payload.playerId);
        if (meta) meta.talking = true;
        this.talkingPeerId = msg.payload.playerId;
        this.notify();
        break;
      }
      case 'VOICE_PEER_STOPPED': {
        const meta = this.peerMeta.get(msg.payload.playerId);
        if (meta) meta.talking = false;
        if (this.talkingPeerId === msg.payload.playerId) this.talkingPeerId = null;
        this.notify();
        break;
      }
      case 'VOICE_AUDIO': {
        if (this.inVoice) this.playAudio(msg.payload.fromId, msg.payload.data);
        break;
      }
    }
  }

  // ── Playback ────────────────────────────────────────────────────────────────

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext({ sampleRate: 48000 });
    }
    return this.audioCtx;
  }

  private async playAudio(_peerId: string, base64: string) {
    try {
      const ctx = this.getAudioCtx();

      const audioBuffer = await ctx.decodeAudioData(fromBase64(base64));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();   // play immediately — it's a complete utterance
    } catch {
      // Decode failed — skip
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  private cleanup() {
    this.recorder?.stop();
    this.recorder = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.inVoice = false;
    this.pttActive = false;
    this.talkingPeerId = null;
    this.peerMeta.clear();
    this.nextPlayTime.clear();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.notify();
  }

  private buildPeerList(): VoicePeer[] {
    return [...this.peerMeta.entries()].map(([id, m]) => ({
      playerId: id,
      username: m.username,
      talking: m.talking,
    }));
  }

  private notify() {
    for (const l of this.listeners) {
      l(this.buildPeerList(), this.inVoice, this.pttActive, this.talkingPeerId);
    }
  }
}

export const voiceService = new VoiceService();
