import { memo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameLogEntry } from '@conqueror/shared';

interface Props {
  log: GameLogEntry[];
}

const LogEntry = memo(function LogEntry({ entry }: { entry: GameLogEntry }) {
  const { t } = useTranslation('game');
  return (
    <p className="text-xs text-gray-300 leading-snug">
      {t(`log.${entry.messageKey.replace('log.', '')}`, entry.params ?? {})}
    </p>
  );
});

export default memo(function GameLog({ log }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  return (
    <div className="h-full overflow-y-auto p-2 space-y-0.5" style={{ scrollbarWidth: 'none' }}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Game Log</p>
      {log.slice(-100).map((entry, i) => (
        <LogEntry key={`${i}-${entry.messageKey}`} entry={entry} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
});
