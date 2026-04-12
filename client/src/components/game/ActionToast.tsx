/**
 * Floating toast notifications for game events:
 * - Dice roll resource distribution
 * - Bank trades (visible to all)
 * - Player actions (build road, settlement, city)
 * - Horn
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PublicGameState, ResourceType } from '@conqueror/shared';
import { ALL_RESOURCES } from '@conqueror/shared';
import { useGameStore } from '../../store/gameStore.js';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';
import { resolvePlayerColor } from '../HexBoard/hexLayout.js';

const CARD_THEME: Record<ResourceType, { bg: string; border: string }> = {
  timber: { bg: '#0f2e14', border: '#22c55e' },
  clay:   { bg: '#3b1004', border: '#f97316' },
  iron:   { bg: '#131c2b', border: '#94a3b8' },
  grain:  { bg: '#2e1d02', border: '#fbbf24' },
  wool:   { bg: '#092b1b', border: '#86efac' },
};

const TOAST_DURATION: Record<string, number> = {
  dice_resources: 5000,
  bank_trade: 4000,
  action: 4000,
  horn: 5000,
  chat: 7000,
  stolen: 6000,
};

interface Props {
  gameState: PublicGameState;
}

export default function ActionToast({ gameState }: Props) {
  const { toasts, removeToast } = useGameStore();
  const timerRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Auto-dismiss toasts
  useEffect(() => {
    for (const toast of toasts) {
      if (!timerRefs.current[toast.id]) {
        timerRefs.current[toast.id] = setTimeout(() => {
          removeToast(toast.id);
          delete timerRefs.current[toast.id];
        }, TOAST_DURATION[toast.type] ?? 5000);
      }
    }
    return () => {
      // cleanup on unmount
    };
  }, [toasts]);

  function playerColor(playerId: string): string {
    return resolvePlayerColor(gameState.players.find(p => p.id === playerId)?.color ?? '#888888');
  }

  function ResourceChip({ r, count }: { r: ResourceType; count: number }) {
    if (count <= 0) return null;
    return (
      <div className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 border"
        style={{ backgroundColor: CARD_THEME[r].bg, borderColor: CARD_THEME[r].border }}>
        {RESOURCE_ICON_MAP[r]?.({ size: 16 })}
        {count > 1 && <span className="text-[10px] font-bold" style={{ color: CARD_THEME[r].border }}>×{count}</span>}
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-[90px] right-3 lg:bottom-6 lg:left-4 lg:right-auto z-[61] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 'min(340px, 90vw)' }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="bg-gray-900/95 border border-gray-700 rounded-2xl px-3 py-2.5 shadow-2xl backdrop-blur-sm pointer-events-auto"
            onClick={() => removeToast(toast.id)}
          >

            {/* Dice roll: resource distribution */}
            {toast.type === 'dice_resources' && (() => {
              const { roll, resources } = toast.data as { roll: [number, number]; resources: Record<string, Record<ResourceType, number>> };
              const total = roll[0] + roll[1];
              const gainers = Object.entries(resources).filter(([, bundle]) =>
                ALL_RESOURCES.some(r => (bundle as any)[r] > 0)
              );
              const rollColor = total === 7 ? '#ef4444' : (total === 6 || total === 8) ? '#f97316' : '#fbbf24';
              return (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl font-bold tabular-nums" style={{ color: rollColor }}>{total}</span>
                    <span className="text-xs text-gray-400">
                      {gainers.length === 0 ? 'No resources' : 'Resources distributed'}
                    </span>
                  </div>
                  {gainers.length > 0 && (
                    <div className="space-y-1">
                      {gainers.map(([pid, bundle]) => {
                        const player = gameState.players.find(p => p.id === pid);
                        const color = playerColor(pid);
                        const gained = ALL_RESOURCES.filter(r => (bundle as any)[r] > 0);
                        return (
                          <div key={pid} className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold truncate max-w-[70px]" style={{ color }}>
                              {player?.username ?? pid}
                            </span>
                            <div className="flex gap-1 flex-wrap">
                              {gained.map(r => (
                                <ResourceChip key={r} r={r} count={(bundle as any)[r]}/>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Bank trade */}
            {toast.type === 'bank_trade' && (() => {
              const { give, want } = toast.data as { give: Record<ResourceType, number>; want: Record<ResourceType, number> };
              const color = playerColor(toast.playerId);
              return (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold shrink-0" style={{ color }}>
                    {toast.username}
                  </span>
                  <span className="text-[10px] text-gray-500 shrink-0">traded with 🏦</span>
                  <div className="flex gap-1 flex-wrap items-center">
                    {ALL_RESOURCES.filter(r => give[r] > 0).map(r => (
                      <ResourceChip key={r} r={r} count={give[r]}/>
                    ))}
                    <span className="text-gray-500 text-xs">→</span>
                    {ALL_RESOURCES.filter(r => want[r] > 0).map(r => (
                      <ResourceChip key={r} r={r} count={want[r]}/>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Player action (build road/settlement/city/devcard) */}
            {toast.type === 'action' && (() => {
              const { action, extra } = toast.data as { action: string; extra?: string };
              const color = playerColor(toast.playerId);
              const actionLabel: Record<string, string> = {
                builtRoad: '🛣 built a road',
                builtSettlement: '🏠 placed a settlement',
                builtCity: '🏙 upgraded to a city',
                boughtDevCard: '🃏 bought a dev card',
                played_warrior: '⚔️ played a Warrior',
                played_roadBuilding: '🛣️ played Road Building',
                played_yearOfPlenty: '🌟 played Year of Plenty',
                played_monopoly: '💰 played Monopoly',
              };
              if (action === 'hurry_up') {
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⏰</span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-bold text-red-400">Hurry up!</span>
                      <span className="text-[10px] text-gray-400">
                        <span className="font-semibold" style={{ color }}>{toast.username}</span>
                        {' '}honked — <span className="text-red-400 font-bold">−2s</span>
                      </span>
                    </div>
                  </div>
                );
              }
              if (action === 'played_monopoly' && extra) {
                const [resource, count] = extra.split(':');
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold" style={{ color }}>{toast.username}</span>
                    <span className="text-xs text-gray-300">💰 played Monopoly</span>
                    <span className="text-xs text-yellow-400 font-semibold">({resource} ×{count})</span>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold" style={{ color }}>{toast.username}</span>
                  <span className="text-xs text-gray-300">{actionLabel[action] ?? action}</span>
                </div>
              );
            })()}

            {/* Horn */}
            {toast.type === 'horn' && (
              <div className="flex items-center gap-2">
                <span className="text-xl">📯</span>
                <span className="text-sm font-semibold"
                  style={{ color: playerColor(toast.playerId) }}>
                  {toast.username}
                </span>
                <span className="text-xs text-gray-400">is honking at you!</span>
              </div>
            )}

            {/* Stolen card (shown only to victim) */}
            {toast.type === 'stolen' && (() => {
              const { resource } = toast.data as { resource: ResourceType };
              const color = playerColor(toast.playerId);
              return (
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none shrink-0">🗡️</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold" style={{ color }}>{toast.username}</span>
                      <span className="text-xs text-red-300 font-semibold">stole from you!</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 border"
                        style={{ backgroundColor: CARD_THEME[resource].bg, borderColor: CARD_THEME[resource].border }}>
                        {RESOURCE_ICON_MAP[resource]?.({ size: 14 })}
                        <span className="text-[10px] font-bold" style={{ color: CARD_THEME[resource].border }}>
                          {resource.charAt(0).toUpperCase() + resource.slice(1)}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500">was taken</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Chat message */}
            {toast.type === 'chat' && (() => {
              const { text } = toast.data as { text: string };
              const color = playerColor(toast.playerId);
              return (
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none shrink-0">💬</span>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold" style={{ color }}>{toast.username}</span>
                    <p className="text-xs text-gray-200 mt-0.5 break-words leading-snug"
                      style={{ wordBreak: 'break-word', maxWidth: 260 }}>
                      {text}
                    </p>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
