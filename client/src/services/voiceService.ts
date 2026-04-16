/**
 * Push-to-talk voice chat — toggle-to-talk model.
 * Sender records the full PTT utterance, sends on release as a single blob.
 * Receiver decodes with AudioContext.decodeAudioData (works on iOS/Android/Desktop).
 * No MediaSource, no SourceBuffer — maximum compatibility.
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

// Best MIME type for the current browser/platform
function getBestMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

// ── Service ───────────────────────────────────────────────────────────────────

class VoiceService {
  private gameId: string | null = null;
  private localStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioCtx: AudioContext | null = null;

  private inVoice = false;
  private pttActive = false;
  private talkingPeerId: string | null = null;

  private listeners: StateListener[] = [];
  private wsUnsub: (() => void) | null = null;
  private peerMeta = new Map<string, { username: string; talking: boolean }>();

  // ── AudioContext (lazy, unlocked in user gesture) ───────────────────────────

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) this.audioCtx = new AudioContext();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    return this.audioCtx;
  }

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
    this.audioCtx?.close();
    this.audioCtx = null;
  }

  subscribe(fn: StateListener) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  getState() {
    return { peers: this.buildPeerList(), inVoice: this.inVoice, pttActive: this.pttActive, talkingPeerId: this.talkingPeerId };
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
    // Unlock AudioContext during user gesture (join button click)
    this.getAudioCtx();
    this.inVoice = true;
    wsService.send({ type: 'VOICE_JOIN', payload: { gameId: this.gameId } });
    this.notify();
  }

  leave() {
    if (!this.inVoice || !this.gameId) return;
    if (this.pttActive) this.stopPTT();
    wsService.send({ type: 'VOICE_LEAVE', payload: { gameId: this.gameId } });
    this.cleanup();
  }

  startPTT() {
    if (!this.inVoice || !this.gameId || this.pttActive || this.talkingPeerId !== null) return;
    if (!this.localStream) return;

    const mime = getBestMime();
    this.pttActive = true;
    this.chunks = [];

    try {
      this.recorder = new MediaRecorder(this.localStream, mime ? { mimeType: mime } : undefined);
    } catch {
      this.recorder = new MediaRecorder(this.localStream);
    }

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.onstop = async () => {
      if (this.chunks.length === 0 || !this.gameId) return;
      const mimeType = this.recorder?.mimeType ?? mime;
      const blob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];
      const data = toBase64(await blob.arrayBuffer());
      wsService.send({ type: 'VOICE_AUDIO', payload: { gameId: this.gameId, data } });
    };

    this.recorder.start();
    wsService.send({ type: 'VOICE_PTT_START', payload: { gameId: this.gameId } });
    this.notify();
  }

  stopPTT() {
    if (!this.pttActive || !this.gameId) return;
    this.pttActive = false;
    this.recorder?.stop(); // triggers onstop → sends complete utterance
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
      case 'VOICE_PEER_JOINED':
        this.peerMeta.set(msg.payload.playerId, { username: msg.payload.username, talking: false });
        this.notify();
        break;

      case 'VOICE_PEER_LEFT':
        this.peerMeta.delete(msg.payload.playerId);
        if (this.talkingPeerId === msg.payload.playerId) this.talkingPeerId = null;
        this.notify();
        break;

      case 'VOICE_PEER_TALKING': {
        const m = this.peerMeta.get(msg.payload.playerId);
        if (m) m.talking = true;
        this.talkingPeerId = msg.payload.playerId;
        this.notify();
        break;
      }
      case 'VOICE_PEER_STOPPED': {
        const m2 = this.peerMeta.get(msg.payload.playerId);
        if (m2) m2.talking = false;
        if (this.talkingPeerId === msg.payload.playerId) this.talkingPeerId = null;
        this.notify();
        break;
      }
      case 'VOICE_AUDIO':
        if (this.inVoice) this.playIncoming(fromBase64(msg.payload.data));
        break;
    }
  }

  // ── Audio playback ──────────────────────────────────────────────────────────

  private async playIncoming(buffer: ArrayBuffer) {
    try {
      const ctx = this.getAudioCtx();
      // decodeAudioData auto-detects format (webm/mp4/ogg) — works on all platforms
      const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch (e) {
      console.warn('[voice] decode failed:', e);
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  private cleanup() {
    this.recorder?.stop();
    this.recorder = null;
    this.chunks = [];
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.inVoice = false;
    this.pttActive = false;
    this.talkingPeerId = null;
    this.peerMeta.clear();
    this.notify();
  }

  private buildPeerList(): VoicePeer[] {
    return [...this.peerMeta.entries()].map(([id, m]) => ({
      playerId: id, username: m.username, talking: m.talking,
    }));
  }

  private notify() {
    for (const l of this.listeners) l(this.buildPeerList(), this.inVoice, this.pttActive, this.talkingPeerId);
  }
}

export const voiceService = new VoiceService();
