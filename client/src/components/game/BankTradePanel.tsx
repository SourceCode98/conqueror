/**
 * Bank trade modal — half-screen fixed overlay.
 * Shows pick grids for give and want; hand chips also tap-to-select.
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES, EMPTY_RESOURCES } from '@conqueror/shared';
import { wsService } from '../../services/wsService.js';
import { useGameStore } from '../../store/gameStore.js';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';
import { cn } from '../../lib/cn.js';

const CARD_THEME: Record<ResourceType, { bg: string; border: string; label: string }> = {
  timber: { bg: '#0f2e14', border: '#22c55e', label: 'Timber' },
  clay:   { bg: '#3b1004', border: '#f97316', label: 'Clay'   },
  iron:   { bg: '#131c2b', border: '#94a3b8', label: 'Iron'   },
  grain:  { bg: '#2e1d02', border: '#fbbf24', label: 'Grain'  },
  wool:   { bg: '#092b1b', border: '#86efac', label: 'Wool'   },
};

interface Props { gameId: string }

export default function BankTradePanel({ gameId }: Props) {
  const { t } = useTranslation('game');
  const { closeTradePanel, setTradeCardCb, setTradeSide, myPlayer, gameState } = useGameStore();
  const [giveResource, setGiveResource] = useState<ResourceType | null>(null);
  const [wantResource, setWantResource] = useState<ResourceType | null>(null);
  const [step, setStep] = useState<'give' | 'want'>('give');

  const me = myPlayer();
  const hand = (me?.resources ?? {}) as Record<ResourceType, number>;

  // Port ratios for this player
  const portRatios: Record<ResourceType, number> = { timber: 4, clay: 4, iron: 4, grain: 4, wool: 4 };
  if (me && gameState) {
    for (const port of gameState.board.ports) {
      const hasAccess = port.vertices.some(vid => gameState.buildings[vid as any]?.playerId === me.id);
      if (!hasAccess) continue;
      if (port.resource === null) {
        for (const r of ALL_RESOURCES) { if (portRatios[r] > port.ratio) portRatios[r] = port.ratio; }
      } else {
        const res = port.resource as ResourceType;
        if (portRatios[res] > port.ratio) portRatios[res] = port.ratio;
      }
    }
  }

  const ratio = giveResource ? portRatios[giveResource] : 4;
  const canTrade = giveResource && wantResource && giveResource !== wantResource && hand[giveResource] >= ratio;

  // Sync step with store's tradeSide so ResourceHand shows the right label
  useEffect(() => {
    setTradeSide(step);
  }, [step]);

  // Also register hand-tap callback
  useEffect(() => {
    setTradeCardCb((r: ResourceType) => {
      if (step === 'give') {
        if (hand[r] >= portRatios[r]) {
          setGiveResource(r);
          setStep('want');
        }
      } else {
        if (r !== giveResource) setWantResource(r);
      }
    });
    return () => setTradeCardCb(null);
  }, [step, giveResource]);

  function pickGive(r: ResourceType) {
    setGiveResource(r);
    setWantResource(null);
    setStep('want');
  }

  function pickWant(r: ResourceType) {
    setWantResource(r);
  }

  function reset() {
    setGiveResource(null);
    setWantResource(null);
    setStep('give');
  }

  function submit() {
    if (!giveResource || !wantResource || !canTrade) return;
    wsService.send({
      type: 'BANK_TRADE',
      payload: {
        gameId,
        give: { ...EMPTY_RESOURCES, [giveResource]: ratio },
        want: { ...EMPTY_RESOURCES, [wantResource]: 1 },
      },
    });
    closeTradePanel();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-2xl border border-gray-700 border-b-0 bg-gray-900 shadow-2xl overflow-y-auto"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 104px)', maxHeight: '85dvh' }}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-gray-700"/>
      </div>

      <div className="px-5 pb-2 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-amber-400 font-bold text-base">🏦 {t('trade.bankTrade')}</h2>
          <button className="text-gray-500 hover:text-white text-sm" onClick={closeTradePanel} aria-label="Close">✕</button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1">
          <div className={cn('flex-1 h-1 rounded-full transition-colors', giveResource ? 'bg-amber-500' : step === 'give' ? 'bg-amber-500/60' : 'bg-gray-700')}/>
          <div className={cn('flex-1 h-1 rounded-full transition-colors', wantResource ? 'bg-green-500' : step === 'want' ? 'bg-green-500/60' : 'bg-gray-700')}/>
        </div>

        {/* ── Step 1: pick give ──────────────────────────────── */}
        {step === 'give' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Pick a resource to give:</p>
            <div className="grid grid-cols-5 gap-2">
              {ALL_RESOURCES.map(r => {
                const canGive = hand[r] >= portRatios[r];
                return (
                  <button key={r}
                    onClick={() => canGive && pickGive(r)}
                    disabled={!canGive}
                    className={cn(
                      'flex flex-col items-center rounded-xl border py-2 transition-transform',
                      canGive ? 'hover:scale-105 cursor-pointer' : 'opacity-30 cursor-not-allowed grayscale',
                    )}
                    style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}
                  >
                    {RESOURCE_ICON_MAP[r]?.({ size: 26 })}
                    <span className="text-[9px] mt-1 font-bold tabular-nums" style={{ color: CARD_THEME[r].border }}>
                      {hand[r]}/{portRatios[r]}
                    </span>
                    <span className="text-[7px] uppercase" style={{ color: CARD_THEME[r].border, opacity: 0.7 }}>
                      {CARD_THEME[r].label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-600 text-center">or tap a card in your hand below</p>
          </div>
        )}

        {/* ── Step 2: show give selection + pick want ───────── */}
        {step === 'want' && giveResource && (
          <div className="space-y-3">
            {/* Give summary */}
            <div className="flex items-center gap-3 bg-gray-800 rounded-xl p-3">
              <div className="rounded-lg border flex items-center justify-center size-11"
                style={{ backgroundColor: CARD_THEME[giveResource].bg, borderColor: CARD_THEME[giveResource].border }}>
                {RESOURCE_ICON_MAP[giveResource]?.({ size: 24 })}
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-semibold">{CARD_THEME[giveResource].label}</p>
                <p className="text-xs text-gray-400">Give {ratio}× → receive 1×</p>
              </div>
              <button className="text-gray-600 hover:text-red-400 text-sm" aria-label="Remove" onClick={reset}>✕</button>
            </div>

            {/* Want grid */}
            <p className="text-gray-400 text-sm">Pick what you receive:</p>
            <div className="grid grid-cols-5 gap-2">
              {ALL_RESOURCES.filter(r => r !== giveResource).map(r => (
                <button key={r}
                  onClick={() => pickWant(r)}
                  className={cn(
                    'flex flex-col items-center rounded-xl border py-2 transition-all',
                    wantResource === r
                      ? 'ring-2 scale-105'
                      : 'hover:scale-105 cursor-pointer',
                  )}
                  style={{
                    backgroundColor: CARD_THEME[r].bg,
                    borderColor: CARD_THEME[r].border,
                    ringColor: CARD_THEME[r].border,
                  } as React.CSSProperties}
                >
                  {RESOURCE_ICON_MAP[r]?.({ size: 26 })}
                  <span className="text-[7px] mt-1 uppercase" style={{ color: CARD_THEME[r].border, opacity: 0.8 }}>
                    {CARD_THEME[r].label}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 text-center">or tap a card in your hand below</p>
          </div>
        )}

        {/* Confirm */}
        <button
          className="btn-primary w-full py-2.5 text-sm font-semibold"
          disabled={!canTrade}
          onClick={submit}
        >
          {canTrade
            ? `Trade ${ratio}× ${CARD_THEME[giveResource!].label} → 1× ${CARD_THEME[wantResource!].label}`
            : step === 'give' ? 'Select a resource to give above' : 'Select a resource to receive above'
          }
        </button>
      </div>
    </motion.div>
  );
}
