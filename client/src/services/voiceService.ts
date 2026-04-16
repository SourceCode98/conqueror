/**
 * Push-to-talk voice chat — real-time streaming via WebSocket relay.
 * Sender streams 100ms webm/opus chunks while PTT is active.
 * Receiver uses MediaSource API to play them back incrementally (~100-200ms latency).
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

const MIME = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
  ? 'audio/webm;codecs=opus'
  : 'audio/webm';

// ── Per-peer MediaSource state ────────────────────────────────────────────────

interface PeerStream {
  audio: HTMLAudioElement;
  ms: MediaSource;
  sb: SourceBuffer | null;
  queue: ArrayBuffer[];
  objectUrl: string;
  endPending: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

class VoiceService {
  private gameId: string | null = null;
  private localStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;

  private inVoice = false;
  private pttActive = false;
  private talkingPeerId: string | null = null;

  private listeners: StateListener[] = [];
  private wsUnsub: (() => void) | null = null;
  private peerMeta = new Map<string, { username: string; talking: boolean }>();
  private peerStreams = new Map<string, PeerStream>();

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

    this.pttActive = true;

    this.recorder = new MediaRecorder(this.localStream, {
      mimeType: MIME,
      audioBitsPerSecond: 32000,
    });

    this.recorder.ondataavailable = async (e) => {
      if (e.data.size === 0 || !this.gameId) return;
      const data = toBase64(await e.data.arrayBuffer());
      wsService.send({ type: 'VOICE_AUDIO', payload: { gameId: this.gameId, data } });
    };

    this.recorder.start(100); // 100ms chunks → ~100-200ms latency
    wsService.send({ type: 'VOICE_PTT_START', payload: { gameId: this.gameId } });
    this.notify();
  }

  stopPTT() {
    if (!this.pttActive || !this.gameId) return;
    this.pttActive = false;
    this.recorder?.stop();
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
        this.teardownStream(msg.payload.playerId);
        this.notify();
        break;

      case 'VOICE_PEER_TALKING': {
        const m = this.peerMeta.get(msg.payload.playerId);
        if (m) m.talking = true;
        this.talkingPeerId = msg.payload.playerId;
        // Set up MediaSource stream for this peer ahead of the first chunk
        this.setupStream(msg.payload.playerId);
        this.notify();
        break;
      }
      case 'VOICE_PEER_STOPPED': {
        const m2 = this.peerMeta.get(msg.payload.playerId);
        if (m2) m2.talking = false;
        if (this.talkingPeerId === msg.payload.playerId) this.talkingPeerId = null;
        // Let the last chunk finish playing before tearing down
        const pid = msg.payload.playerId;
        const stream = this.peerStreams.get(pid);
        if (stream) {
          stream.endPending = true;
          // endOfStream after drain
          this.drainQueue(pid);
        }
        this.notify();
        break;
      }
      case 'VOICE_AUDIO':
        if (this.inVoice) this.appendChunk(msg.payload.fromId, fromBase64(msg.payload.data));
        break;
    }
  }

  // ── MediaSource streaming ───────────────────────────────────────────────────

  private setupStream(peerId: string) {
    this.teardownStream(peerId); // clean up any previous stream

    const ms = new MediaSource();
    const objectUrl = URL.createObjectURL(ms);
    const audio = document.createElement('audio');
    audio.autoplay = true;
    (audio as any).playsInline = true;
    audio.style.display = 'none';
    audio.src = objectUrl;
    document.body.appendChild(audio);

    const stream: PeerStream = { audio, ms, sb: null, queue: [], objectUrl, endPending: false };
    this.peerStreams.set(peerId, stream);

    ms.addEventListener('sourceopen', () => {
      try {
        const sb = ms.addSourceBuffer(MIME);
        stream.sb = sb;
        sb.addEventListener('updateend', () => this.drainQueue(peerId));
        this.drainQueue(peerId);
      } catch { /* MIME not supported */ }
    });

    audio.play().catch(() => {});
  }

  private appendChunk(peerId: string, buffer: ArrayBuffer) {
    let stream = this.peerStreams.get(peerId);
    // Safety: if chunk arrives before VOICE_PEER_TALKING set up the stream now
    if (!stream) { this.setupStream(peerId); stream = this.peerStreams.get(peerId)!; }
    stream.queue.push(buffer);
    this.drainQueue(peerId);
  }

  private drainQueue(peerId: string) {
    const stream = this.peerStreams.get(peerId);
    if (!stream || !stream.sb || stream.sb.updating) return;
    if (stream.queue.length > 0) {
      try { stream.sb.appendBuffer(stream.queue.shift()!); } catch { /* quota / abort */ }
    } else if (stream.endPending && stream.ms.readyState === 'open') {
      try { stream.ms.endOfStream(); } catch {}
      // Tear down after audio finishes
      stream.audio.addEventListener('ended', () => this.teardownStream(peerId), { once: true });
      // Fallback teardown in case 'ended' doesn't fire
      setTimeout(() => this.teardownStream(peerId), 3000);
    }
  }

  private teardownStream(peerId: string) {
    const stream = this.peerStreams.get(peerId);
    if (!stream) return;
    try { if (stream.ms.readyState === 'open') stream.ms.endOfStream(); } catch {}
    stream.audio.pause();
    stream.audio.remove();
    URL.revokeObjectURL(stream.objectUrl);
    this.peerStreams.delete(peerId);
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
    for (const peerId of [...this.peerStreams.keys()]) this.teardownStream(peerId);
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
