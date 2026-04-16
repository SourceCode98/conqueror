import { useEffect, useState } from 'react';
import { voiceService, type VoicePeer } from '../../services/voiceService.js';

interface Props {
  gameId: string;
}

export default function VoiceChat({ gameId }: Props) {
  const [inVoice, setInVoice] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  const [talkingPeerId, setTalkingPeerId] = useState<string | null>(null);
  const [peers, setPeers] = useState<VoicePeer[]>([]);

  useEffect(() => {
    voiceService.init(gameId);
    const unsub = voiceService.subscribe((p, iv, ptt, talking) => {
      setPeers(p);
      setInVoice(iv);
      setPttActive(ptt);
      setTalkingPeerId(talking);
    });
    return () => { unsub(); voiceService.destroy(); };
  }, [gameId]);

  const someoneTalking = pttActive || talkingPeerId !== null;
  const talkingPeer = peers.find(p => p.playerId === talkingPeerId);

  return (
    <div className="flex items-center gap-1">

      {/* Join / Leave */}
      <button
        onClick={() => inVoice ? voiceService.leave() : voiceService.join()}
        title={inVoice ? 'Leave voice chat' : 'Join voice chat'}
        className={`rounded-lg px-2 py-1.5 text-xs border transition-colors ${
          inVoice
            ? 'border-green-700 bg-green-900/40 text-green-300 hover:bg-red-900/30 hover:border-red-700 hover:text-red-300'
            : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
        }`}
      >
        🎙️
      </button>

      {/* PTT button — tap once to start, tap again to send */}
      {inVoice && (
        <button
          onClick={() => pttActive ? voiceService.stopPTT() : voiceService.startPTT()}
          disabled={!pttActive && talkingPeerId !== null}
          title={
            pttActive ? 'Tap to send'
            : talkingPeerId ? `${talkingPeer?.username ?? '?'} is talking…`
            : 'Tap to talk'
          }
          className={`select-none rounded-xl font-bold border transition-all
            px-4 py-2.5 text-sm min-w-[90px]
            lg:px-3 lg:py-1.5 lg:text-xs lg:min-w-0
            ${pttActive
              ? 'border-red-500 bg-red-600/70 text-white shadow-[0_0_12px_rgba(239,68,68,0.7)] animate-pulse'
              : talkingPeerId !== null
                ? 'border-gray-700 bg-gray-800/60 text-gray-500 cursor-not-allowed'
                : 'border-amber-600 bg-amber-900/40 text-amber-300 hover:bg-amber-800/60 active:scale-95'
            }`}
        >
          {pttActive
            ? '🔴 Talking…'
            : talkingPeerId
              ? `🔴 ${talkingPeer?.username ?? '?'}`
              : '🎤 Talk'}
        </button>
      )}

      {/* Peer avatars */}
      {inVoice && peers.length > 0 && (
        <div className="flex items-center gap-0.5">
          {peers.map(peer => (
            <div
              key={peer.playerId}
              title={peer.username}
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border transition-all ${
                peer.talking
                  ? 'border-green-400 bg-green-900/60 shadow-[0_0_6px_rgba(74,222,128,0.7)] animate-pulse'
                  : 'border-gray-600 bg-gray-800 text-gray-300'
              }`}
            >
              {peer.username.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
