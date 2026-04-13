/**
 * Unified trade negotiation panel — shown to ALL players during TRADE_OFFER phase.
 *
 * Layout:
 *  - Original offer terms (what the active player proposes)
 *  - Response list: every other player's status (accept / decline / counter with terms)
 *    • Active player sees "Confirm ✓" / "Accept counter" buttons
 *  - Action row for non-active players: Accept | Decline | Counter-offer expander
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES, hasResources } from '@conqueror/shared';
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

type Bundle = Record<ResourceType, number>;

function ResourcePips({ bundle, size = 20 }: { bundle: Record<string, number>; size?: number }) {
  const cards = ALL_RESOURCES.filter(r => (bundle as Bundle)[r] > 0);
  if (cards.length === 0) return <span className="text-[10px] text-gray-600 italic">nothing</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {cards.map(r => (
        <div key={r}
          className="flex flex-col items-center rounded-lg border px-1.5 py-1"
          style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
          {RESOURCE_ICON_MAP[r]?.({ size })}
          <span className="text-[8px] font-bold tabular-nums mt-0.5" style={{ color: CARD_THEME[r].border }}>
            ×{(bundle as Bundle)[r]}
          </span>
        </div>
      ))}
    </div>
  );
}

function CardPip({ r, onRemove }: { r: ResourceType; onRemove: () => void }) {
  return (
    <button onClick={onRemove}
      className="group relative rounded-lg border flex items-center justify-center size-9 transition-all hover:ring-2 hover:ring-red-500"
      style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
      {RESOURCE_ICON_MAP[r]?.({ size: 18 })}
      <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-red-900/80 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-white text-[10px] font-bold">×</span>
      </div>
    </button>
  );
}

/**
 * Counter-offer editor for non-active players.
 * "give" is LOCKED to offer.want (the active player's demand — non-negotiable).
 * Only "want" (what you ask from the active player in return) is editable.
 */
function CounterEditor({
  myResources,
  lockedGive,   // = offer.want, shown read-only
  initialWant,
  onSend,
  onCancel,
}: {
  myResources: Bundle;
  lockedGive: Bundle;
  initialWant: Bundle;
  onSend: (give: Bundle, want: Bundle) => void;
  onCancel: () => void;
}) {
  const [want, setWant] = useState<Bundle>({ ...initialWant });

  const canSend = ALL_RESOURCES.some(r => lockedGive[r] > 0) && ALL_RESOURCES.some(r => want[r] > 0);
  const canAffordGive = ALL_RESOURCES.every(r => myResources[r] >= lockedGive[r]);
  const wantCards = ALL_RESOURCES.flatMap(r => Array.from({ length: want[r] }, () => r));

  return (
    <div className="rounded-xl border border-amber-700 bg-amber-950/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-amber-300 text-sm font-semibold">↩ Counter-offer</p>
        <button className="text-gray-500 hover:text-gray-300 text-sm" onClick={onCancel}>✕</button>
      </div>

      {/* Give — read-only (locked to offer.want) */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-2 space-y-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400 flex-1">
            You give (fixed)
          </p>
          <span className="text-[8px] text-gray-600 italic">non-negotiable</span>
        </div>
        <ResourcePips bundle={lockedGive} size={18}/>
        {!canAffordGive && (
          <p className="text-[9px] text-red-400 font-medium mt-1">⚠ You don't have these resources</p>
        )}
      </div>

      {/* Want — fully editable */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-2 space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-green-400">
          You want in return ({ALL_RESOURCES.reduce((s, r) => s + want[r], 0)})
        </p>
        {wantCards.length > 0
          ? <div className="flex flex-wrap gap-1">{wantCards.map((r, i) => <CardPip key={i} r={r} onRemove={() => setWant(p => ({ ...p, [r]: Math.max(0, p[r] - 1) }))}/>)}</div>
          : <p className="text-[10px] text-gray-600 italic">None selected</p>
        }
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-700">
          {ALL_RESOURCES.map(r => (
            <button key={r} onClick={() => setWant(p => ({ ...p, [r]: p[r] + 1 }))}
              className="flex flex-col items-center rounded-xl border p-1 w-10 hover:scale-105 transition-transform"
              style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
              {RESOURCE_ICON_MAP[r]?.({ size: 18 })}
              <span className="text-[8px] mt-0.5" style={{ color: CARD_THEME[r].border }}>{CARD_THEME[r].label.slice(0, 3)}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        className={cn('w-full py-2.5 rounded-xl text-sm font-semibold transition-colors',
          canSend && canAffordGive ? 'bg-amber-700 hover:bg-amber-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed')}
        disabled={!canSend || !canAffordGive}
        onClick={() => onSend(lockedGive, want)}
      >
        Send Counter-offer
      </button>
    </div>
  );
}

/**
 * Inline editor for the active player to modify what they give (offer.give).
 * All respondents will reset to pending when submitted.
 */
function ModifyGiveEditor({
  myResources,
  currentGive,
  onSend,
  onCancel,
}: {
  myResources: Bundle;
  currentGive: Bundle;
  onSend: (give: Bundle) => void;
  onCancel: () => void;
}) {
  const [give, setGive] = useState<Bundle>({ ...currentGive });

  const total = ALL_RESOURCES.reduce((s, r) => s + give[r], 0);
  const canSend = total > 0 && ALL_RESOURCES.every(r => myResources[r] >= give[r]);
  const giveCards = ALL_RESOURCES.flatMap(r => Array.from({ length: give[r] }, () => r));

  return (
    <div className="rounded-xl border border-blue-700 bg-blue-950/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-blue-300 text-sm font-semibold">✏ Modify what you give</p>
        <button className="text-gray-500 hover:text-gray-300 text-sm" onClick={onCancel}>✕</button>
      </div>
      <p className="text-[10px] text-gray-400">Changing this resets all responses — everyone must re-accept.</p>

      <div className="rounded-xl border border-gray-700 bg-gray-800 p-2 space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400">You give ({total})</p>
        {giveCards.length > 0
          ? <div className="flex flex-wrap gap-1">{giveCards.map((r, i) => <CardPip key={i} r={r} onRemove={() => setGive(p => ({ ...p, [r]: Math.max(0, p[r] - 1) }))}/>)}</div>
          : <p className="text-[10px] text-gray-600 italic">None</p>
        }
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-700">
          {ALL_RESOURCES.filter(r => myResources[r] > 0).map(r => {
            const avail = myResources[r] - give[r];
            return (
              <button key={r} disabled={avail <= 0}
                onClick={() => setGive(p => ({ ...p, [r]: p[r] + 1 }))}
                className="flex flex-col items-center rounded-xl border p-1 w-10 disabled:opacity-30 hover:scale-105 transition-transform"
                style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
                {RESOURCE_ICON_MAP[r]?.({ size: 18 })}
                <span className="text-[8px] font-bold tabular-nums mt-0.5" style={{ color: CARD_THEME[r].border }}>{avail}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        className={cn('w-full py-2.5 rounded-xl text-sm font-semibold transition-colors',
          canSend ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed')}
        disabled={!canSend}
        onClick={() => onSend(give)}
      >
        Update Offer
      </button>
    </div>
  );
}

interface Props { gameId: string }

export default function TradeResponsePanel({ gameId }: Props) {
  const { gameState, myPlayer } = useGameStore();
  const offer = gameState?.tradeOffer;
  const me = myPlayer();
  const [showCounter, setShowCounter] = useState(false);
  const [showModifyGive, setShowModifyGive] = useState(false);

  if (!offer || !me || !gameState) return null;

  const offerer     = gameState.players.find(p => p.id === offer.fromPlayerId);
  const myResources = me.resources as Bundle;
  const isActiveTurn = me.id === gameState.activePlayerId;
  // Non-active players can respond; active player can only confirm/cancel
  const canRespond  = !isActiveTurn && me.id !== offer.fromPlayerId && me.id in offer.respondents;
  const myRespondent = offer.respondents[me.id];
  const myStatus     = myRespondent?.status ?? 'pending';
  const alreadyResponded = myStatus !== 'pending';

  const canFulfillOriginal = ALL_RESOURCES.every(r => myResources[r] >= offer.want[r]);

  // Counter: give is locked to offer.want; want starts as offer.give
  function buildInitialWant(): Bundle {
    return { ...offer!.give } as Bundle;
  }

  function sendCounter(give: Bundle, want: Bundle) {
    wsService.send({ type: 'COUNTER_TRADE', payload: { gameId, give, want } });
    setShowCounter(false);
  }

  function sendModifyGive(give: Bundle) {
    wsService.send({ type: 'MODIFY_OFFER_GIVE', payload: { gameId, give } });
    setShowModifyGive(false);
  }

  // Offerer-name label (the active player)
  const offererName = offerer?.username ?? '?';

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-2xl border border-gray-700 border-b-0 bg-gray-900 shadow-2xl overflow-y-auto"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 104px)', maxHeight: '85dvh' }}
    >
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-gray-700"/>
      </div>

      <div className="px-4 pb-3 space-y-3">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <h2 className="text-amber-400 font-bold text-base">🤝 Trade Negotiation</h2>
          {isActiveTurn && (
            <button
              className="text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded px-2 py-0.5 transition-colors"
              onClick={() => wsService.send({ type: 'CANCEL_TRADE', payload: { gameId } })}
            >
              Cancel
            </button>
          )}
        </div>

        {/* ── Original offer ── */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-3">
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            <span className="font-bold" style={{ color: resolvePlayerColor(offerer?.color ?? 'blue') }}>{offererName}</span>
            {' '}proposes
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-amber-400 font-bold uppercase tracking-widest mb-1">Gives</p>
              <ResourcePips bundle={offer.give} />
            </div>
            <span className="text-gray-500 text-lg shrink-0">→</span>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-green-400 font-bold uppercase tracking-widest mb-1">Wants</p>
              <ResourcePips bundle={offer.want} />
            </div>
          </div>
        </div>

        {/* ── All player responses ── */}
        <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-2 space-y-1.5">
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Responses</p>
          {gameState.players.filter(p => p.id !== offer.fromPlayerId).map(p => {
            const respondent = offer.respondents[p.id];
            const status  = respondent?.status ?? 'pending';
            const color   = resolvePlayerColor(p.color);
            const isMe    = p.id === me.id;

            return (
              <div key={p.id} className="rounded-lg overflow-hidden"
                style={{
                  background: status === 'accept'  ? 'rgba(21,128,61,0.18)'  :
                              status === 'reject'  ? 'rgba(127,29,29,0.18)'  :
                              status === 'counter' ? `${color}18`            :
                              'rgba(31,41,55,0.5)',
                  border: status === 'counter' ? `1px solid ${color}44` : '1px solid transparent',
                }}>

                {/* Player name + status row */}
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }}/>
                    <span className="text-xs font-semibold truncate" style={{ color }}>
                      {p.username}{isMe ? ' (you)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <span className={cn('text-[10px] font-semibold',
                      status === 'accept'             ? 'text-green-400'  :
                      status === 'reject'             ? 'text-red-400'    :
                      status === 'counter'            ? 'text-amber-400'  :
                      status === 'rejected_by_offerer'? 'text-gray-600'   : 'text-gray-500')}>
                      {status === 'accept'              ? '✓ Accept'         :
                       status === 'reject'              ? '✕ Decline'        :
                       status === 'counter'             ? '↩ Counter'        :
                       status === 'rejected_by_offerer' ? '✕ Rejected'       : '⏳ Deciding'}
                    </span>
                    {/* Active player: confirm an accept */}
                    {isActiveTurn && status === 'accept' && (
                      <button
                        className="text-[10px] bg-green-700 hover:bg-green-600 text-white rounded px-2 py-0.5 transition-colors"
                        onClick={() => wsService.send({ type: 'ACCEPT_PLAYER_TRADE', payload: { gameId, fromPlayerId: p.id } })}
                      >
                        Confirm ✓
                      </button>
                    )}
                    {/* Active player: accept or reject a counter */}
                    {isActiveTurn && status === 'counter' && (
                      <>
                        {(() => {
                          const canAffordCounter = respondent?.want
                            ? hasResources(myResources, respondent.want as Bundle)
                            : false;
                          return (
                            <button
                              disabled={!canAffordCounter}
                              className="text-[10px] bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-2 py-0.5 transition-colors"
                              onClick={() => wsService.send({ type: 'ACCEPT_PLAYER_TRADE', payload: { gameId, fromPlayerId: p.id } })}
                              title={!canAffordCounter ? 'Not enough resources' : undefined}
                            >
                              Accept ↩
                            </button>
                          );
                        })()}
                        <button
                          className="text-[10px] bg-red-900 hover:bg-red-800 text-red-300 rounded px-2 py-0.5 transition-colors"
                          onClick={() => wsService.send({ type: 'REJECT_COUNTER_OFFER', payload: { gameId, playerId: p.id } })}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Counter-offer terms (visible to all) — bordered with player color */}
                {status === 'counter' && respondent?.give && respondent?.want && (
                  <div className="mx-2 mb-2 rounded-lg px-2 py-1.5 flex items-center gap-2 flex-wrap"
                    style={{ border: `1px solid ${color}33`, background: `${color}0f` }}>
                    <div>
                      <p className="text-[8px] font-bold uppercase mb-0.5" style={{ color }}>Offers</p>
                      <ResourcePips bundle={respondent.give} size={16}/>
                    </div>
                    <span className="text-gray-600 text-sm">→</span>
                    <div>
                      <p className="text-[8px] font-bold uppercase mb-0.5" style={{ color }}>Wants</p>
                      <ResourcePips bundle={respondent.want} size={16}/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Active player: modify what they give ── */}
        {isActiveTurn && !showModifyGive && (
          <button
            className="w-full py-2 rounded-xl text-sm font-semibold border border-blue-700 text-blue-400 hover:bg-blue-900/30 transition-colors"
            onClick={() => setShowModifyGive(true)}
          >
            ✏ Modify what I give
          </button>
        )}
        <AnimatePresence>
          {isActiveTurn && showModifyGive && (
            <motion.div
              key="modify-give"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <ModifyGiveEditor
                myResources={myResources}
                currentGive={offer.give as Bundle}
                onSend={sendModifyGive}
                onCancel={() => setShowModifyGive(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Actions for non-active players ── */}
        {canRespond && !showCounter && (
          <div className="space-y-2">
            {/* Resource warning */}
            {!canFulfillOriginal && myStatus === 'pending' && (
              <div className="rounded-xl border border-red-900 bg-red-950/40 p-2">
                <p className="text-red-400 text-xs font-medium">Missing resources for this offer</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {ALL_RESOURCES.filter(r => offer.want[r] > 0 && myResources[r] < offer.want[r]).map(r => (
                    <span key={r} className="text-[10px] text-red-300 bg-red-900/40 rounded px-1.5 py-0.5">
                      −{offer.want[r] - myResources[r]}× {CARD_THEME[r].label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Accept / Decline */}
            {(!alreadyResponded || myStatus === 'counter') && (
              <div className="flex gap-2">
                <button
                  className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                    canFulfillOriginal
                      ? 'bg-green-700 hover:bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed')}
                  disabled={!canFulfillOriginal}
                  onClick={() => wsService.send({ type: 'RESPOND_TRADE', payload: { gameId, response: 'accept' } })}
                >
                  ✓ Accept
                </button>
                <button
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-900 hover:bg-red-800 text-white transition-colors"
                  onClick={() => wsService.send({ type: 'RESPOND_TRADE', payload: { gameId, response: 'reject' } })}
                >
                  ✕ Decline
                </button>
              </div>
            )}

            {/* Already responded (not counter) */}
            {alreadyResponded && myStatus !== 'counter' && (
              <div className={cn('rounded-xl border p-2.5 flex items-center justify-between',
                myStatus === 'accept' ? 'border-green-800 bg-green-950/40' : 'border-gray-700 bg-gray-800/40')}>
                <p className={cn('text-sm font-medium',
                  myStatus === 'accept' ? 'text-green-400' : 'text-gray-400')}>
                  {myStatus === 'accept' ? '✓ Accepted — waiting for confirmation' : '✕ You declined'}
                </p>
                {myStatus === 'reject' && (
                  <button
                    className="text-xs text-amber-400 hover:text-amber-300 underline ml-2"
                    onClick={() => wsService.send({ type: 'RESPOND_TRADE', payload: { gameId, response: 'accept' } })}
                  >
                    Accept instead
                  </button>
                )}
              </div>
            )}

            {/* Counter-offer button */}
            <button
              className="w-full py-2 rounded-xl text-sm font-semibold border border-amber-700 text-amber-400 hover:bg-amber-900/30 transition-colors"
              onClick={() => setShowCounter(true)}
            >
              {myStatus === 'counter' ? '↩ Edit Counter-offer' : '↩ Make Counter-offer'}
            </button>
          </div>
        )}

        {/* ── Counter editor ── */}
        <AnimatePresence>
          {showCounter && canRespond && (
            <motion.div
              key="counter"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <CounterEditor
                myResources={myResources}
                lockedGive={offer.want as Bundle}
                initialWant={myRespondent?.status === 'counter' && myRespondent.want
                  ? myRespondent.want as Bundle
                  : buildInitialWant()}
                onSend={sendCounter}
                onCancel={() => setShowCounter(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}
