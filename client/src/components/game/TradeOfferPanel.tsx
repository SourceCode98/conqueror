/**
 * Player trade offer modal — half-screen fixed overlay.
 * Self-contained: reads hand from the store.
 * Uses the ResourceHand at the bottom for card selection.
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { ResourceBundle, ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES, EMPTY_RESOURCES } from '@conqueror/shared';
import { wsService } from '../../services/wsService.js';
import { useGameStore } from '../../store/gameStore.js';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';

const CARD_THEME: Record<ResourceType, { bg: string; border: string; label: string }> = {
  timber: { bg: '#0f2e14', border: '#22c55e', label: 'Timber' },
  clay:   { bg: '#3b1004', border: '#f97316', label: 'Clay'   },
  iron:   { bg: '#131c2b', border: '#94a3b8', label: 'Iron'   },
  grain:  { bg: '#2e1d02', border: '#fbbf24', label: 'Grain'  },
  wool:   { bg: '#092b1b', border: '#86efac', label: 'Wool'   },
};

interface Props {
  gameId: string;
}

export default function TradeOfferPanel({ gameId }: Props) {
  const { t } = useTranslation('game');
  const { closeTradePanel, myPlayer } = useGameStore();
  const [give, setGive] = useState<ResourceBundle>({ ...EMPTY_RESOURCES });
  const [want, setWant] = useState<ResourceBundle>({ ...EMPTY_RESOURCES });

  const me = myPlayer();
  const hand = (me?.resources ?? {}) as Record<ResourceType, number>;

  const totalGive = ALL_RESOURCES.reduce((s, r) => s + give[r], 0);
  const totalWant = ALL_RESOURCES.reduce((s, r) => s + want[r], 0);
  const canOffer = totalGive > 0 && totalWant > 0;

  function removeFromGive(r: ResourceType) {
    setGive(prev => ({ ...prev, [r]: Math.max(0, prev[r] - 1) }));
  }
  function removeFromWant(r: ResourceType) {
    setWant(prev => ({ ...prev, [r]: Math.max(0, prev[r] - 1) }));
  }

  function submit() {
    if (!canOffer) return;
    wsService.send({ type: 'OFFER_TRADE', payload: { gameId, give, want } });
    closeTradePanel();
  }

  const giveCards = ALL_RESOURCES.flatMap(r => Array.from({ length: give[r] }, () => r));
  const wantCards = ALL_RESOURCES.flatMap(r => Array.from({ length: want[r] }, () => r));

  function CardPip({ r, onRemove }: { r: ResourceType; onRemove: () => void }) {
    return (
      <button onClick={onRemove} aria-label={`Remove ${CARD_THEME[r].label}`}
        className="group relative rounded-lg border flex items-center justify-center size-10 transition-all hover:ring-2 hover:ring-red-500"
        style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
        {RESOURCE_ICON_MAP[r]?.({ size: 20 })}
        <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-red-900/80 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-xs font-bold">×</span>
        </div>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-2xl border border-gray-700 border-b-0 bg-gray-900 shadow-2xl overflow-y-auto"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 104px)', maxHeight: '85dvh' }}
    >
      {/* Handle bar */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-gray-700"/>
      </div>

      <div className="px-5 pb-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-amber-400 font-bold text-base">🤝 {t('trade.playerTrade')}</h2>
          <button className="text-gray-500 hover:text-white text-sm" onClick={closeTradePanel} aria-label="Close">✕</button>
        </div>

        {/* Give pile + picker */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-3 space-y-2">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
            Give ({totalGive})
          </p>
          {giveCards.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No cards selected</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {giveCards.map((r, i) => (
                <CardPip key={i} r={r} onRemove={() => removeFromGive(r)}/>
              ))}
            </div>
          )}
          {/* Resource picker — from your hand */}
          <div className="flex gap-2 flex-wrap pt-1 border-t border-gray-700">
            {ALL_RESOURCES.filter(r => hand[r] > 0).map(r => {
              const available = hand[r] - give[r];
              return (
                <button key={r}
                  disabled={available <= 0}
                  onClick={() => setGive(prev => ({ ...prev, [r]: prev[r] + 1 }))}
                  className="flex flex-col items-center rounded-xl border p-1.5 w-11 disabled:opacity-30 hover:scale-105 transition-transform"
                  style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
                  {RESOURCE_ICON_MAP[r]?.({ size: 22 })}
                  <span className="text-[8px] mt-0.5 font-bold tabular-nums" style={{ color: CARD_THEME[r].border }}>
                    {available}
                  </span>
                </button>
              );
            })}
            {ALL_RESOURCES.every(r => hand[r] === 0) && (
              <p className="text-xs text-gray-600 italic">No resources in hand</p>
            )}
          </div>
        </div>

        {/* Want pile + picker */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-3 space-y-2">
          <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">
            Want ({totalWant})
          </p>
          {wantCards.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No cards selected</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {wantCards.map((r, i) => (
                <CardPip key={i} r={r} onRemove={() => removeFromWant(r)}/>
              ))}
            </div>
          )}
          {/* Quick-pick any resource */}
          <div className="flex gap-2 flex-wrap pt-1 border-t border-gray-700">
            {ALL_RESOURCES.map(r => (
              <button key={r}
                onClick={() => setWant(prev => ({ ...prev, [r]: prev[r] + 1 }))}
                className="flex flex-col items-center rounded-xl border p-1.5 w-11 hover:scale-105 transition-transform"
                style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
                {RESOURCE_ICON_MAP[r]?.({ size: 22 })}
                <span className="text-[8px] mt-0.5" style={{ color: CARD_THEME[r].border }}>{CARD_THEME[r].label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Confirm */}
        <button
          className="btn-primary w-full py-2.5 text-sm font-semibold"
          disabled={!canOffer}
          onClick={submit}
        >
          {canOffer
            ? `Offer ${totalGive} resource${totalGive > 1 ? 's' : ''} → receive ${totalWant}`
            : 'Select resources above'
          }
        </button>
      </div>
    </motion.div>
  );
}
