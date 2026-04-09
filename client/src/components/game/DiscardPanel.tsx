import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResourceBundle, ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES, EMPTY_RESOURCES } from '@conqueror/shared';
import { wsService } from '../../services/wsService.js';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';

interface Props {
  gameId: string;
  hand: ResourceBundle;
  requiredCount: number;
}

export default function DiscardPanel({ gameId, hand, requiredCount }: Props) {
  const { t } = useTranslation('game');
  const [selected, setSelected] = useState<ResourceBundle>({ ...EMPTY_RESOURCES });

  const totalSelected = ALL_RESOURCES.reduce((s, r) => s + selected[r], 0);
  const remaining = requiredCount - totalSelected;

  function adjust(r: ResourceType, delta: number) {
    setSelected(prev => {
      const next = prev[r] + delta;
      if (next < 0 || next > hand[r]) return prev;
      if (delta > 0 && totalSelected >= requiredCount) return prev;
      return { ...prev, [r]: next };
    });
  }

  function submit() {
    if (totalSelected !== requiredCount) return;
    wsService.send({ type: 'DISCARD_CARDS', payload: { gameId, cards: selected } });
  }

  return (
    <div className="space-y-3">
      <p className="text-red-400 font-semibold text-sm">
        {t('discard.title')} — {t('discard.instruction', { count: remaining })}
      </p>

      <div className="grid grid-cols-5 gap-1">
        {ALL_RESOURCES.map(r => (
          <div key={r} className="text-center">
            <div className="flex justify-center">{RESOURCE_ICON_MAP[r]?.({ size: 24 })}</div>
            <div className="text-xs text-gray-400 mb-1">{hand[r]}</div>
            <div className="flex flex-col items-center gap-0.5">
              <button
                className="w-6 h-6 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-30"
                disabled={selected[r] >= hand[r] || totalSelected >= requiredCount}
                onClick={() => adjust(r, 1)}
              >+</button>
              <span className="text-sm font-bold text-white">{selected[r]}</span>
              <button
                className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold disabled:opacity-30"
                disabled={selected[r] <= 0}
                onClick={() => adjust(r, -1)}
              >−</button>
            </div>
          </div>
        ))}
      </div>

      <button
        className="btn-danger w-full"
        disabled={totalSelected !== requiredCount}
        onClick={submit}
      >
        Discard {totalSelected} / {requiredCount} cards
      </button>
    </div>
  );
}
