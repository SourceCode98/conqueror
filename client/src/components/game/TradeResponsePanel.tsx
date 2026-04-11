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

// Pip: selected card, click to remove
function CardPip({ r, onRemove }: { r: ResourceType; onRemove: () => void }) {
  return (
    <button onClick={onRemove} aria-label={`Remove ${r}`}
      className="group relative rounded-lg border flex items-center justify-center size-9 transition-all hover:ring-2 hover:ring-red-500"
      style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
      {RESOURCE_ICON_MAP[r]?.({ size: 18 })}
      <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-red-900/80 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-white text-[10px] font-bold">×</span>
      </div>
    </button>
  );
}

type CounterBundle = Record<ResourceType, number>;

interface Props { gameId: string }

export default function TradeResponsePanel({ gameId }: Props) {
  const { gameState, myPlayer } = useGameStore();
  const offer = gameState?.tradeOffer;
  const me = myPlayer();

  // counter: null = not in counter mode; object = inline editor state
  const [counter, setCounter] = useState<{ give: CounterBundle; want: CounterBundle } | null>(null);

  if (!offer || !me) return null;

  const offerer = gameState?.players.find(p => p.id === offer.fromPlayerId);
  const myResources = me.resources as Record<ResourceType, number>;
  const isOfferer = offer.fromPlayerId === me.id;
  const isCounter = offer.fromPlayerId !== gameState?.activePlayerId;

  const canFulfill = ALL_RESOURCES.every(r => myResources[r] >= offer.want[r]);
  const myResponse = offer.respondents[me.id];
  const alreadyResponded = myResponse === 'accept' || myResponse === 'reject';

  function respond(response: 'accept' | 'reject') {
    wsService.send({ type: 'RESPOND_TRADE', payload: { gameId, response } });
  }

  function openCounter() {
    // Pre-fill inverted, but clamp "give" to what we actually have
    const clampedGive = {} as CounterBundle;
    for (const r of ALL_RESOURCES) {
      clampedGive[r] = Math.min((offer!.want as CounterBundle)[r], myResources[r]);
    }
    setCounter({
      give: clampedGive,
      want: { ...offer!.give as CounterBundle },
    });
  }

  function addToGive(r: ResourceType) {
    if (!counter) return;
    const available = myResources[r] - counter.give[r];
    if (available <= 0) return;
    setCounter(prev => prev ? { ...prev, give: { ...prev.give, [r]: prev.give[r] + 1 } } : prev);
  }
  function removeFromGive(r: ResourceType) {
    if (!counter) return;
    setCounter(prev => prev ? { ...prev, give: { ...prev.give, [r]: Math.max(0, prev.give[r] - 1) } } : prev);
  }
  function addToWant(r: ResourceType) {
    if (!counter) return;
    setCounter(prev => prev ? { ...prev, want: { ...prev.want, [r]: prev.want[r] + 1 } } : prev);
  }
  function removeFromWant(r: ResourceType) {
    if (!counter) return;
    setCounter(prev => prev ? { ...prev, want: { ...prev.want, [r]: Math.max(0, prev.want[r] - 1) } } : prev);
  }

  function sendCounter() {
    if (!counter) return;
    wsService.send({ type: 'COUNTER_TRADE', payload: { gameId, give: counter.give, want: counter.want } });
    setCounter(null);
  }

  const canSendCounter = counter
    ? ALL_RESOURCES.some(r => counter.give[r] > 0) && ALL_RESOURCES.some(r => counter.want[r] > 0)
    : false;

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
            {isCounter ? '↩' : '🤝'} {isCounter ? 'Counter-offer' : 'Trade Offer'}{!isOfferer && ` from ${offerer?.username}`}
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

                {/* Give side — capped to your hand */}
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-2 space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400">You give ({ALL_RESOURCES.reduce((s,r) => s + counter.give[r], 0)})</p>
                  {(() => {
                    const selected = ALL_RESOURCES.flatMap(r => Array.from({ length: counter.give[r] }, () => r));
                    return selected.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selected.map((r, i) => <CardPip key={i} r={r} onRemove={() => removeFromGive(r)}/>)}
                      </div>
                    ) : <p className="text-[10px] text-gray-600 italic">None</p>;
                  })()}
                  {/* Picker: only resources you have, capped */}
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-700">
                    {ALL_RESOURCES.filter(r => myResources[r] > 0).map(r => {
                      const available = myResources[r] - counter.give[r];
                      return (
                        <button key={r} disabled={available <= 0}
                          onClick={() => addToGive(r)}
                          className="flex flex-col items-center rounded-xl border p-1 w-10 disabled:opacity-30 hover:scale-105 transition-transform"
                          style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
                          {RESOURCE_ICON_MAP[r]?.({ size: 18 })}
                          <span className="text-[8px] font-bold tabular-nums mt-0.5" style={{ color: CARD_THEME[r].border }}>{available}</span>
                        </button>
                      );
                    })}
                    {ALL_RESOURCES.every(r => myResources[r] === 0) && (
                      <p className="text-[10px] text-gray-600 italic">No resources</p>
                    )}
                  </div>
                </div>

                {/* Want side — any resource */}
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-2 space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-green-400">You want ({ALL_RESOURCES.reduce((s,r) => s + counter.want[r], 0)})</p>
                  {(() => {
                    const selected = ALL_RESOURCES.flatMap(r => Array.from({ length: counter.want[r] }, () => r));
                    return selected.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selected.map((r, i) => <CardPip key={i} r={r} onRemove={() => removeFromWant(r)}/>)}
                      </div>
                    ) : <p className="text-[10px] text-gray-600 italic">None</p>;
                  })()}
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-700">
                    {ALL_RESOURCES.map(r => (
                      <button key={r} onClick={() => addToWant(r)}
                        className="flex flex-col items-center rounded-xl border p-1 w-10 hover:scale-105 transition-transform"
                        style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
                        {RESOURCE_ICON_MAP[r]?.({ size: 18 })}
                        <span className="text-[8px] mt-0.5" style={{ color: CARD_THEME[r].border }}>{CARD_THEME[r].label.slice(0,3)}</span>
                      </button>
                    ))}
                  </div>
                </div>

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
