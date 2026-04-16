/**
 * Voice chat via WebSocket relay.
 * Audio is captured with MediaRecorder (webm/opus, 200ms chunks),
 * sent as base64 through the game's WebSocket server, and played
 * back with Web Audio API scheduled buffering — no WebRTC needed.
 */
import { wsService } from './wsService.js';

export interface VoicePeer {
  playerId: string;
  username: string;
  muted: boolean;
  speaking: boolean;
}

type StateListener = (peers: VoicePeer[], inVoice: boolean, muted: boolean) => void;

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
  private headerBlob: Blob | null = null;   // webm init segment — prepended to every chunk
  private mimeType = 'audio/webm;codecs=opus';

  private inVoice = false;
  private muted = false;
  private listeners: StateListener[] = [];
  private wsUnsub: (() => void) | null = null;

  // Peer display metadata
  private peerMeta = new Map<string, { username: string; muted: boolean; speaking: boolean }>();

  // Playback: one AudioContext, per-peer scheduling cursor
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

  // ── Public API ──────────────────────────────────────────────────────────────

  async join() {
    if (this.inVoice || !this.gameId) return;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      alert('Could not access microphone.');
      return;
    }
    this.inVoice = true;
    this.muted = false;
    this.startRecording();
    wsService.send({ type: 'VOICE_JOIN', payload: { gameId: this.gameId } });
    this.notify();
  }

  leave() {
    if (!this.inVoice || !this.gameId) return;
    wsService.send({ type: 'VOICE_LEAVE', payload: { gameId: this.gameId } });
    this.cleanup();
  }

  toggleMute() {
    if (!this.inVoice || !this.gameId) return;
    this.muted = !this.muted;
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    wsService.send({ type: 'VOICE_MUTE', payload: { gameId: this.gameId, muted: this.muted } });
    this.notify();
  }

  getState() {
    const peers: VoicePeer[] = [...this.peerMeta.entries()].map(([id, m]) => ({
      playerId: id, username: m.username, muted: m.muted, speaking: m.speaking,
    }));
    return { peers, inVoice: this.inVoice, muted: this.muted };
  }

  // ── Recording ───────────────────────────────────────────────────────────────

  private startRecording() {
    if (!this.localStream) return;

    this.mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.recorder = new MediaRecorder(this.localStream, {
      mimeType: this.mimeType,
      audioBitsPerSecond: 32000,
    });
    this.headerBlob = null;

    this.recorder.ondataavailable = async (e) => {
      if (e.data.size === 0 || !this.inVoice || !this.gameId) return;

      if (!this.headerBlob) {
        // First chunk is the webm init segment (container header).
        // We keep it and prepend it to every subsequent chunk so each
        // packet is a self-contained decodable webm blob.
        this.headerBlob = e.data;
        return;
      }

      if (this.muted) return;

      // Combine header + audio chunk → decodable webm
      const combined = new Blob([this.headerBlob, e.data], { type: this.mimeType });
      const data = toBase64(await combined.arrayBuffer());
      wsService.send({ type: 'VOICE_AUDIO', payload: { gameId: this.gameId, data } });
    };

    this.recorder.start(200); // 200 ms slices → ~160ms latency after network
  }

  // ── Server messages ─────────────────────────────────────────────────────────

  private handleServerMsg(msg: { type: string; payload: any }) {
    switch (msg.type) {
      case 'VOICE_PEERS': {
        for (const peer of msg.payload.peers as Array<{ playerId: string; username: string; muted: boolean }>) {
          this.peerMeta.set(peer.playerId, { username: peer.username, muted: peer.muted, speaking: false });
        }
        this.notify();
        break;
      }
      case 'VOICE_PEER_JOINED': {
        const { playerId, username } = msg.payload;
        this.peerMeta.set(playerId, { username, muted: false, speaking: false });
        this.notify();
        break;
      }
      case 'VOICE_PEER_LEFT': {
        this.peerMeta.delete(msg.payload.playerId);
        this.nextPlayTime.delete(msg.payload.playerId);
        this.notify();
        break;
      }
      case 'VOICE_PEER_MUTED': {
        const meta = this.peerMeta.get(msg.payload.playerId);
        if (meta) meta.muted = msg.payload.muted;
        this.notify();
        break;
      }
      case 'VOICE_AUDIO': {
        if (this.inVoice) this.playChunk(msg.payload.fromId, msg.payload.data);
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

  private async playChunk(peerId: string, base64: string) {
    try {
      const ctx = this.getAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(fromBase64(base64));

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Schedule back-to-back so chunks play gaplessly
      const now = ctx.currentTime;
      const cursor = this.nextPlayTime.get(peerId) ?? now;
      // If cursor is more than 500ms behind now the peer fell silent; reset
      const startAt = cursor < now - 0.5 ? now + 0.05 : Math.max(now + 0.01, cursor);
      source.start(startAt);
      this.nextPlayTime.set(peerId, startAt + audioBuffer.duration);

      // Speaking indicator: mark active, clear after chunk plays out
      const meta = this.peerMeta.get(peerId);
      if (meta && !meta.speaking) {
        meta.speaking = true;
        this.notify();
      }
      setTimeout(() => {
        const m = this.peerMeta.get(peerId);
        if (m?.speaking) { m.speaking = false; this.notify(); }
      }, (startAt - now + audioBuffer.duration + 0.15) * 1000);

    } catch {
      // Chunk failed to decode — skip silently
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  private cleanup() {
    this.recorder?.stop();
    this.recorder = null;
    this.headerBlob = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.inVoice = false;
    this.muted = false;
    this.peerMeta.clear();
    this.nextPlayTime.clear();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.notify();
  }

  private notify() {
    const peers: VoicePeer[] = [...this.peerMeta.entries()].map(([id, m]) => ({
      playerId: id, username: m.username, muted: m.muted, speaking: m.speaking,
    }));
    for (const l of this.listeners) l(peers, this.inVoice, this.muted);
  }
}

export const voiceService = new VoiceService();
