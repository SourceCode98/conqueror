import { useEffect, useState } from 'react';
import { voiceService, type VoicePeer } from '../../services/voiceService.js';

interface Props {
  gameId: string;
}

export default function VoiceChat({ gameId }: Props) {
  const [inVoice, setInVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);

  useEffect(() => {
    voiceService.init(gameId);
    const unsub = voiceService.subscribe((p, iv, m) => {
      setPeers(p);
      setInVoice(iv);
      setMuted(m);
    });
    return () => {
      unsub();
      voiceService.destroy();
    };
  }, [gameId]);

  return (
    <div className="flex items-center gap-1">
      {/* Join / Leave */}
      <button
        onClick={() => inVoice ? voiceService.leave() : voiceService.join()}
        title={inVoice ? 'Leave voice chat' : 'Join voice chat'}
        className={`rounded-lg px-2 py-1.5 text-xs border transition-colors ${
          inVoice
            ? 'border-green-600 bg-green-900/40 text-green-300 hover:bg-red-900/40 hover:border-red-600 hover:text-red-300'
            : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
        }`}
      >
        {inVoice ? '🎙️' : '🎙️'}
        <span className="ml-1">{inVoice ? 'VC' : 'VC'}</span>
      </button>

      {/* Mute toggle — only when in voice */}
      {inVoice && (
        <button
          onClick={() => voiceService.toggleMute()}
          title={muted ? 'Unmute' : 'Mute'}
          className={`rounded-lg px-2 py-1.5 text-xs border transition-colors ${
            muted
              ? 'border-red-600 bg-red-900/40 text-red-300'
              : 'border-gray-600 text-gray-300 hover:border-gray-400'
          }`}
        >
          {muted ? '🔇' : '🎤'}
        </button>
      )}

      {/* Peer avatars — only when in voice and there are peers */}
      {inVoice && peers.length > 0 && (
        <div className="flex items-center gap-0.5">
          {peers.map(peer => (
            <div
              key={peer.playerId}
              title={`${peer.username}${peer.muted ? ' (muted)' : ''}`}
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border transition-all ${
                peer.speaking
                  ? 'border-green-400 bg-green-900/60 shadow-[0_0_6px_rgba(74,222,128,0.6)]'
                  : peer.muted
                    ? 'border-red-700 bg-gray-800 text-gray-500'
                    : 'border-gray-600 bg-gray-800 text-gray-300'
              }`}
            >
              {peer.username.charAt(0).toUpperCase()}
              {peer.muted && (
                <span className="absolute -bottom-0.5 -right-0.5 text-[8px]">🔇</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
