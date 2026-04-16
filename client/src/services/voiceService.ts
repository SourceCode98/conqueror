/**
 * WebRTC voice chat service — mesh P2P, one RTCPeerConnection per peer.
 * Signaling is done through the existing WebSocket (wsService).
 */
import { wsService } from './wsService.js';

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export interface VoicePeer {
  playerId: string;
  username: string;
  muted: boolean;
  speaking: boolean;
}

type StateListener = (peers: VoicePeer[], inVoice: boolean, muted: boolean) => void;

class VoiceService {
  private gameId: string | null = null;
  private localStream: MediaStream | null = null;
  private peers = new Map<string, RTCPeerConnection>();
  private peerMeta = new Map<string, { username: string; muted: boolean; speaking: boolean }>();
  private inVoice = false;
  private muted = false;
  private listeners: StateListener[] = [];
  private wsUnsub: (() => void) | null = null;

  // Speaking detection
  private analyserCtx: AudioContext | null = null;
  private speakingTimers = new Map<string, ReturnType<typeof setInterval>>();

  // ── Public API ──────────────────────────────────────────────────────────────

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

  // ── Server message handler ──────────────────────────────────────────────────

  private handleServerMsg(msg: { type: string; payload: any }) {
    switch (msg.type) {
      case 'VOICE_PEERS': {
        // We just joined — create offers for all existing peers
        for (const peer of msg.payload.peers as Array<{ playerId: string; username: string; muted: boolean }>) {
          this.peerMeta.set(peer.playerId, { username: peer.username, muted: peer.muted, speaking: false });
          this.createOffer(peer.playerId);
        }
        this.notify();
        break;
      }
      case 'VOICE_PEER_JOINED': {
        const { playerId, username } = msg.payload;
        this.peerMeta.set(playerId, { username, muted: false, speaking: false });
        // Don't create offer here — the joiner will send us one via VOICE_PEERS
        this.notify();
        break;
      }
      case 'VOICE_PEER_LEFT': {
        this.closePeer(msg.payload.playerId);
        this.notify();
        break;
      }
      case 'VOICE_PEER_MUTED': {
        const meta = this.peerMeta.get(msg.payload.playerId);
        if (meta) meta.muted = msg.payload.muted;
        this.notify();
        break;
      }
      case 'VOICE_OFFER': {
        this.handleOffer(msg.payload.fromId, msg.payload.offer);
        break;
      }
      case 'VOICE_ANSWER': {
        this.peers.get(msg.payload.fromId)?.setRemoteDescription(msg.payload.answer).catch(() => {});
        break;
      }
      case 'VOICE_ICE': {
        this.peers.get(msg.payload.fromId)?.addIceCandidate(msg.payload.candidate).catch(() => {});
        break;
      }
    }
  }

  // ── WebRTC helpers ──────────────────────────────────────────────────────────

  private buildPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(STUN);

    // Add local tracks
    this.localStream?.getTracks().forEach(t => pc.addTrack(t, this.localStream!));

    // ICE candidate → forward to peer via WS
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && this.gameId) {
        wsService.send({ type: 'VOICE_ICE', payload: { gameId: this.gameId, targetId: peerId, candidate: candidate.toJSON() } });
      }
    };

    // Remote audio track → attach to hidden <audio> element
    pc.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (!stream) return;
      let audio = document.getElementById(`voice-${peerId}`) as HTMLAudioElement | null;
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `voice-${peerId}`;
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
      }
      audio.srcObject = stream;
      this.trackSpeaking(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peerId);
        this.notify();
      }
    };

    this.peers.set(peerId, pc);
    return pc;
  }

  private async createOffer(peerId: string) {
    if (!this.gameId) return;
    const pc = this.buildPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsService.send({ type: 'VOICE_OFFER', payload: { gameId: this.gameId, targetId: peerId, offer } });
  }

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit) {
    if (!this.gameId) return;
    const pc = this.buildPeerConnection(peerId);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsService.send({ type: 'VOICE_ANSWER', payload: { gameId: this.gameId, targetId: peerId, answer } });
  }

  private closePeer(peerId: string) {
    this.peers.get(peerId)?.close();
    this.peers.delete(peerId);
    this.peerMeta.delete(peerId);
    clearInterval(this.speakingTimers.get(peerId));
    this.speakingTimers.delete(peerId);
    const el = document.getElementById(`voice-${peerId}`);
    el?.remove();
  }

  private cleanup() {
    for (const peerId of [...this.peers.keys()]) this.closePeer(peerId);
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.inVoice = false;
    this.muted = false;
    this.peerMeta.clear();
    this.analyserCtx?.close();
    this.analyserCtx = null;
    this.notify();
  }

  // ── Speaking detection ──────────────────────────────────────────────────────

  private trackSpeaking(peerId: string, stream: MediaStream) {
    clearInterval(this.speakingTimers.get(peerId));
    if (!this.analyserCtx) this.analyserCtx = new AudioContext();
    const source = this.analyserCtx.createMediaStreamSource(stream);
    const analyser = this.analyserCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const timer = setInterval(() => {
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      const meta = this.peerMeta.get(peerId);
      if (meta && meta.speaking !== avg > 10) {
        meta.speaking = avg > 10;
        this.notify();
      }
    }, 150);
    this.speakingTimers.set(peerId, timer);
  }

  // ── State ───────────────────────────────────────────────────────────────────

  private notify() {
    const peers: VoicePeer[] = [...this.peerMeta.entries()].map(([id, m]) => ({
      playerId: id,
      username: m.username,
      muted: m.muted,
      speaking: m.speaking,
    }));
    for (const l of this.listeners) l(peers, this.inVoice, this.muted);
  }

  getState() {
    const peers: VoicePeer[] = [...this.peerMeta.entries()].map(([id, m]) => ({
      playerId: id, username: m.username, muted: m.muted, speaking: m.speaking,
    }));
    return { peers, inVoice: this.inVoice, muted: this.muted };
  }
}

export const voiceService = new VoiceService();
