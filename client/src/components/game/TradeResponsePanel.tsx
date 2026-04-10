/**
 * Trade response panel — shown to all players when a trade offer is active.
 * - Offerer sees: all player accept/reject/pending statuses, can confirm with any acceptor
 * - Others see: the offer details, accept/decline, and can inline counter-offer
 * Counter-offer: shown inline within the same panel; button only active when terms are changed.
 * If the player has already declined, counter-offer is not available.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES } from '@conqueror/shared';
import { wsService } from '../../services/wsService.js';
import { useGameStore } from '../../store/gameStore.js';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';
import { cn } from '../../lib/cn.js';

const CARD_THEME: Record<ResourceType, { bg: string; border: string; label: string }> = {
  timber: { bg: '#0f2e14', border: '#22c55e', label: 'Timber' },
  clay:   { bg: '#3b1004', border: '#f97316', label: 'Clay'   },
  iron:   { bg: '#131c2b', border: '#94a3b8', label: 'Iron'   },
  grain:  { bg: '#2e1d02', border: '#fbbf24', label: 'Grain'  },
  wool:   { bg: '#092b1b', border: '#86efac', label: 'Wool'   },
};

function ResourceRow({
  label, accentColor, bundle, compact,
}: {
  label: string;
  accentColor: string;
  bundle: Record<ResourceType, number>;
  compact?: boolean;
}) {
  const cards = ALL_RESOURCES.filter(r => bundle[r] > 0);
  if (cards.length === 0) return null;
  return (
    <div className={cn('rounded-xl border border-gray-700 bg-gray-800', compact ? 'p-2' : 'p-3')}>
      <p className={cn('font-bold uppercase tracking-widest mb-1.5', compact ? 'text-[9px]' : 'text-[10px]')} style={{ color: accentColor }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {cards.map(r => (
          <div key={r}
            className={cn('flex flex-col items-center rounded-xl border', compact ? 'py-1 px-1.5' : 'py-1.5 px-2')}
            style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
            {RESOURCE_ICON_MAP[r]?.({ size: compact ? 20 : 26 })}
            <span className={cn('font-bold tabular-nums mt-0.5', compact ? 'text-[8px]' : 'text-[9px]')}
              style={{ color: CARD_THEME[r].border }}>
              ×{bundle[r]}
            </span>
            {!compact && (
              <span className="text-[7px] uppercase" style={{ color: CARD_THEME[r].border, opacity: 0.7 }}>
                {CARD_THEME[r].label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CounterEditor({
  label, accentColor, bundle, onChange,
}: {
  label: string;
  accentColor: string;
  bundle: Record<ResourceType, number>;
  onChange: (r: ResourceType, delta: number) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-2">
      <p className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: accentColor }}>{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_RESOURCES.map(r => (
          <div key={r} className="flex flex-col items-center gap-0.5">
            <div className="rounded-xl border flex flex-col items-center py-1 px-1.5"
              style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
              {RESOURCE_ICON_MAP[r]?.({ size: 20 })}
              <span className="text-[9px] font-bold tabular-nums" style={{ color: CARD_THEME[r].border }}>
                ×{bundle[r]}
              </span>
            </div>
            <div className="flex gap-0.5">
              <button
                className="w-5 h-5 rounded bg-gray-700 text-gray-300 text-xs hover:bg-gray-600 disabled:opacity-30"
                disabled={bundle[r] <= 0}
                onClick={() => onChange(r, -1)}
              >−</button>
              <button
                className="w-5 h-5 rounded bg-gray-700 text-gray-300 text-xs hover:bg-gray-600"
                onClick={() => onChange(r, +1)}
              >+</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type CounterBundle = Record<ResourceType, number>;

interface Props { gameId: string }

export default function TradeResponsePanel({ gameId }: Props) {
  const { gameState, myPlayer, openTradePanel } = useGameStore();
  const offer = gameState?.tradeOffer;
  const me = myPlayer();

  // counter: null = not in counter mode; object = inline editor state
  const [counter, setCounter] = useState<{ give: CounterBundle; want: CounterBundle } | null>(null);

  if (!offer || !me) return null;

  const offerer = gameState?.players.find(p => p.id === offer.fromPlayerId);
  const myResources = me.resources as Record<ResourceType, number>;
  const isOfferer = offer.fromPlayerId === me.id;

  const canFulfill = ALL_RESOURCES.every(r => myResources[r] >= offer.want[r]);
  const myResponse = offer.respondents[me.id];
  const alreadyResponded = myResponse === 'accept' || myResponse === 'reject';
  const hasDeclined = myResponse === 'reject';

  const acceptors = Object.entries(offer.respondents).filter(([, s]) => s === 'accept');

  function respond(response: 'accept' | 'reject') {
    wsService.send({ type: 'RESPOND_TRADE', payload: { gameId, response } });
  }

  function openCounter() {
    // Pre-fill with INVERTED offer: I give what they wanted, I want what they gave
    setCounter({
      give: { ...offer!.want as CounterBundle },
      want: { ...offer!.give as CounterBundle },
    });
  }

  function adjustCounter(side: 'give' | 'want', r: ResourceType, delta: number) {
    if (!counter) return;
    setCounter(prev => {
      if (!prev) return prev;
      const cur = prev[side][r] + delta;
      return { ...prev, [side]: { ...prev[side], [r]: Math.max(0, cur) } };
    });
  }

  function sendCounter() {
    if (!counter) return;
    wsService.send({ type: 'CANCEL_TRADE', payload: { gameId } });
    // Small delay to let the cancel propagate, then open the offer panel
    // The counter data is passed via a one-time store setter so TradeOfferPanel can pre-fill
    setTimeout(() => {
      openTradePanel('offer');
      // Store counter in sessionStorage for TradeOfferPanel to pick up
      sessionStorage.setItem('counterOffer', JSON.stringify(counter));
    }, 100);
    setCounter(null);
  }

  // Is counter offer different from the inverted original?
  const counterChanged = counter ? ALL_RESOURCES.some(r =>
    counter.give[r] !== (offer.want as any)[r] ||
    counter.want[r] !== (offer.give as any)[r]
  ) : false;

  const hasAnyCounter = counter ? ALL_RESOURCES.some(r => counter.give[r] > 0 || counter.want[r] > 0) : false;
  const canSendCounter = counterChanged && hasAnyCounter;

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

      <div className="px-5 pb-2 space-y-3">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <h2 className="text-amber-400 font-bold text-base">
            🤝 Trade {isOfferer ? 'Offer' : `from ${offerer?.username}`}
          </h2>
          {isOfferer && (
            <button
              className="text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded px-2 py-0.5 transition-colors"
              onClick={() => wsService.send({ type: 'CANCEL_TRADE', payload: { gameId } })}
            >
              Cancel
            </button>
          )}
        </div>

        {/* ── Original offer summary ── */}
        <div className="grid grid-cols-2 gap-2">
          <ResourceRow label={isOfferer ? 'You give' : 'They give you'} accentColor="#4ade80" bundle={offer.give as any} compact/>
          <ResourceRow label={isOfferer ? 'You want' : 'You give them'} accentColor="#f97316" bundle={offer.want as any} compact/>
        </div>

        {/* ── All player statuses ── */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-2">
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Responses</p>
          <div className="flex flex-col gap-1">
            {gameState!.players.filter(p => p.id !== offer.fromPlayerId).map(p => {
              const status = offer.respondents[p.id] ?? 'pending';
              const color = resolvePlayerColor(p.color);
              return (
                <div key={p.id} className="flex items-center justify-between px-2 py-1 rounded-lg"
                  style={{ background: status === 'accept' ? 'rgba(21,128,61,0.2)' : status === 'reject' ? 'rgba(127,29,29,0.2)' : 'rgba(31,41,55,0.6)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }}/>
                    <span className="text-xs font-medium" style={{ color }}>{p.username}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] font-semibold',
                      status === 'accept' ? 'text-green-400' : status === 'reject' ? 'text-red-400' : 'text-gray-500')}>
                      {status === 'accept' ? '✓ Accept' : status === 'reject' ? '✕ Decline' : '⏳ Deciding'}
                    </span>
                    {isOfferer && status === 'accept' && (
                      <button
                        className="text-[10px] bg-green-700 hover:bg-green-600 text-white rounded px-2 py-0.5 transition-colors"
                        onClick={() => wsService.send({ type: 'ACCEPT_PLAYER_TRADE', payload: { gameId, fromPlayerId: p.id } })}
                      >
                        Confirm ✓
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Responder actions (only when not yet responded) ── */}
        {!isOfferer && !alreadyResponded && !counter && (
          <>
            {!canFulfill && (
              <div className="rounded-xl border border-red-900 bg-red-950/40 p-2">
                <p className="text-red-400 text-xs font-medium">You don't have the required resources</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ALL_RESOURCES.filter(r => offer.want[r] > 0 && myResources[r] < offer.want[r]).map(r => {
                    const missing = offer.want[r] - myResources[r];
                    return (
                      <span key={r} className="text-[10px] text-red-300 bg-red-900/40 rounded px-1.5 py-0.5">
                        Missing {missing}× {CARD_THEME[r].label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                  canFulfill ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed')}
                disabled={!canFulfill}
                onClick={() => respond('accept')}
              >
                ✓ Accept
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-900 hover:bg-red-800 text-white transition-colors"
                onClick={() => respond('reject')}
              >
                ✕ Decline
              </button>
            </div>

            {/* Counter-offer trigger — only available before declining */}
            <button
              className="w-full py-2 rounded-xl text-sm font-semibold border border-amber-700 text-amber-400 hover:bg-amber-900/30 transition-colors"
              onClick={openCounter}
            >
              ↩ Make Counter-offer
            </button>
          </>
        )}

        {/* ── Already responded (and not in counter mode) ── */}
        {!isOfferer && alreadyResponded && !counter && (
          <p className="text-center text-gray-500 text-sm">
            {myResponse === 'accept' ? 'Waiting for the offerer to confirm…' : 'You declined this offer.'}
          </p>
        )}

        {/* ── Inline counter-offer editor ── */}
        <AnimatePresence>
          {counter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-amber-700 bg-amber-950/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-amber-300 text-sm font-semibold">↩ Counter-offer</p>
                  <button className="text-gray-500 hover:text-gray-300 text-sm" onClick={() => setCounter(null)}>✕</button>
                </div>
                <p className="text-gray-500 text-xs">Adjust the terms and send a new offer. The original offer will be cancelled.</p>

                <CounterEditor
                  label="You give"
                  accentColor="#f97316"
                  bundle={counter.give}
                  onChange={(r, d) => adjustCounter('give', r, d)}
                />
                <CounterEditor
                  label="You want"
                  accentColor="#4ade80"
                  bundle={counter.want}
                  onChange={(r, d) => adjustCounter('want', r, d)}
                />

                <button
                  className={cn(
                    'w-full py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    canSendCounter
                      ? 'bg-amber-700 hover:bg-amber-600 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                  )}
                  disabled={!canSendCounter}
                  onClick={sendCounter}
                >
                  Send Counter-offer
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
