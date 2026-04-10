import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameLogEntry } from '@conqueror/shared';

interface Props {
  log: GameLogEntry[];
}

export default function GameLog({ log }: Props) {
  const { t } = useTranslation('game');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  return (
    <div className="h-full overflow-y-auto p-2 space-y-0.5" style={{ scrollbarWidth: 'none' }}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Game Log</p>
      {log.map((entry, i) => (
        <p key={i} className="text-xs text-gray-300 leading-snug">
          {t(`log.${entry.messageKey.replace('log.', '')}`, entry.params ?? {})}
        </p>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
