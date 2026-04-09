import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../store/gameStore.js';
import { wsService } from '../../services/wsService.js';

interface Props {
  gameId: string;
}

export default function ChatPanel({ gameId }: Props) {
  const { t } = useTranslation();
  const { chatMessages } = useGameStore();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  function sendChat() {
    if (!text.trim()) return;
    wsService.send({ type: 'CHAT', payload: { gameId, text: text.trim() } });
    setText('');
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('chat')}</p>
        {chatMessages.map((msg, i) => (
          <p key={i} className="text-xs text-gray-300">
            <span className="text-amber-400 font-medium">{msg.username}:</span> {msg.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        className="flex border-t border-gray-700"
        onSubmit={e => { e.preventDefault(); sendChat(); }}
      >
        <input
          className="flex-1 bg-transparent px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none"
          placeholder={t('typeMessage')}
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={200}
        />
        <button type="submit" className="px-2 text-xs text-amber-400 hover:text-amber-300">
          {t('send')}
        </button>
      </form>
    </div>
  );
}
