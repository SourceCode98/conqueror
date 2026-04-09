/**
 * Trade response modal — shown to players who receive a trade offer.
 * Half-screen overlay. Self-contained, reads from store.
 */
import { motion } from 'motion/react';
import type { ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES } from '@conqueror/shared';
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

function ResourceRow({
  label, accentColor, bundle,
}: {
  label: string;
  accentColor: string;
  bundle: Record<ResourceType, number>;
}) {
  const cards = ALL_RESOURCES.filter(r => bundle[r] > 0);
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: accentColor }}>
        {label}
      </p>
      {cards.length === 0 ? (
        <p className="text-xs text-gray-600 italic">Nothing</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cards.map(r => (
            <div key={r}
              className="flex flex-col items-center rounded-xl border py-1.5 px-2"
              style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
              {RESOURCE_ICON_MAP[r]?.({ size: 26 })}
              <span className="text-[9px] font-bold tabular-nums mt-0.5" style={{ color: CARD_THEME[r].border }}>
                ×{bundle[r]}
              </span>
              <span className="text-[7px] uppercase" style={{ color: CARD_THEME[r].border, opacity: 0.7 }}>
                {CARD_THEME[r].label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props { gameId: string }

export default function TradeResponsePanel({ gameId }: Props) {
  const { gameState, myPlayer } = useGameStore();
  const offer = gameState?.tradeOffer;
  const me = myPlayer();

  if (!offer || !me) return null;

  const offerer = gameState?.players.find(p => p.id === offer.fromPlayerId);
  const myResources = me.resources as Record<ResourceType, number>;

  // Check if local player can fulfill the trade (they need to give what offerer wants)
  const canFulfill = ALL_RESOURCES.every(r => myResources[r] >= offer.want[r]);

  // Already responded?
  const myResponse = offer.respondents[me.id];
  const alreadyResponded = myResponse === 'accept' || myResponse === 'reject';

  function respond(response: 'accept' | 'reject') {
    wsService.send({ type: 'RESPOND_TRADE', payload: { gameId, response } });
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
          <h2 className="text-amber-400 font-bold text-base">
            🤝 Trade from {offerer?.username}
          </h2>
          {alreadyResponded && (
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              myResponse === 'accept' ? 'bg-green-800 text-green-200' : 'bg-red-900 text-red-300',
            )}>
              {myResponse === 'accept' ? 'Accepted' : 'Declined'}
            </span>
          )}
        </div>

        {/* They give you */}
        <ResourceRow
          label="They give you"
          accentColor="#4ade80"
          bundle={offer.give as Record<ResourceType, number>}
        />

        {/* You give them */}
        <ResourceRow
          label="You give them"
          accentColor="#f97316"
          bundle={offer.want as Record<ResourceType, number>}
        />

        {/* Resource check */}
        {!canFulfill && (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-3">
            <p className="text-red-400 text-sm font-medium">You don't have the required resources</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ALL_RESOURCES.filter(r => offer.want[r] > 0).map(r => {
                const missing = offer.want[r] - myResources[r];
                if (missing <= 0) return null;
                return (
                  <span key={r} className="text-[10px] text-red-300 bg-red-900/40 rounded px-1.5 py-0.5">
                    Missing {missing}× {CARD_THEME[r].label}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {!alreadyResponded ? (
          <div className="flex gap-2">
            <button
              className={cn(
                'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                canFulfill
                  ? 'bg-green-700 hover:bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed',
              )}
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
        ) : (
          <p className="text-center text-gray-500 text-sm">
            {myResponse === 'accept'
              ? 'Waiting for the offerer to confirm…'
              : 'You declined this offer.'}
          </p>
        )}
      </div>
    </motion.div>
  );
}
