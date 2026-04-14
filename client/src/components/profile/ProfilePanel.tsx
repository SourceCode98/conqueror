import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UNLOCKS, getTier, ELO_TIERS } from '@conqueror/shared';
import { useProfileStore } from '../../store/profileStore.js';
import { useAuthStore } from '../../store/authStore.js';

interface Props {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  horn: '📯 Horn Sounds',
  road: '🛤 Road Skins',
  building: '🏠 Building Skins',
};

const SKIN_PREVIEWS: Record<string, string> = {
  horn_default:     '🔔',
  horn_fanfare:     '🎺',
  horn_royal:       '👑',
  horn_war:         '⚔️',
  road_default:     '🪵',
  road_iron:        '⚙️',
  road_stone:       '🪨',
  road_gold:        '✨',
  building_default: '🏠',
  building_iron:    '🏭',
  building_stone:   '🏰',
  building_gold:    '🏆',
};

export default function ProfilePanel({ onClose }: Props) {
  const { profile, updateCosmetics } = useProfileStore();
  const { token } = useAuthStore();
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  const tier = getTier(profile.elo);
  const nextTier = ELO_TIERS.find(t => t.min > profile.elo);
  const progress = nextTier
    ? ((profile.elo - tier.min) / (nextTier.min - tier.min)) * 100
    : 100;

  const winRate = profile.gamesPlayed > 0
    ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100)
    : 0;

  async function selectCosmetic(type: string, id: string) {
    if (!token || saving) return;
    setSaving(true);
    const patch =
      type === 'horn'     ? { selectedHorn: id } :
      type === 'road'     ? { selectedRoadSkin: id } :
                            { selectedBuildingSkin: id };
    await updateCosmetics(token, patch);
    setSaving(false);
  }

  const selected: Record<string, string> = {
    horn:     profile.selectedHorn,
    road:     profile.selectedRoadSkin,
    building: profile.selectedBuildingSkin,
  };

  const unlocked = new Set(profile.unlocks);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-2xl"
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <h2 className="text-lg font-bold text-white">{profile.username}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">✕</button>
          </div>

          {/* ELO + Stats */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="text-3xl font-black tabular-nums"
                style={{ color: tier.color }}
              >
                {profile.elo}
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: tier.color }}>{tier.label}</div>
                {nextTier && (
                  <div className="text-xs text-gray-500">{nextTier.min - profile.elo} to {nextTier.label}</div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: tier.color }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Played', value: profile.gamesPlayed },
                { label: 'Won', value: profile.gamesWon },
                { label: 'Win %', value: `${winRate}%` },
              ].map(s => (
                <div key={s.label} className="bg-gray-800 rounded-lg py-2">
                  <div className="text-lg font-bold text-white">{s.value}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cosmetics */}
          <div className="p-4 space-y-5">
            {(['horn', 'road', 'building'] as const).map(type => (
              <div key={type}>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {CATEGORY_LABELS[type]}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {UNLOCKS.filter(u => u.type === type).map(unlock => {
                    const isUnlocked = unlocked.has(unlock.id);
                    const isSelected = selected[type] === unlock.id;
                    return (
                      <button
                        key={unlock.id}
                        disabled={!isUnlocked || saving}
                        onClick={() => selectCosmetic(type, unlock.id)}
                        className={[
                          'relative flex flex-col items-center gap-1 rounded-xl p-2 border transition-all',
                          isSelected
                            ? 'border-amber-500 bg-amber-900/30'
                            : isUnlocked
                              ? 'border-gray-700 hover:border-gray-500 bg-gray-800'
                              : 'border-gray-800 bg-gray-850 opacity-40 cursor-not-allowed',
                        ].join(' ')}
                      >
                        <span className="text-2xl">{SKIN_PREVIEWS[unlock.id] ?? '?'}</span>
                        <span className={`text-[10px] font-medium ${isSelected ? 'text-amber-300' : 'text-gray-400'}`}>
                          {unlock.label}
                        </span>
                        {!isUnlocked && (
                          <span className="absolute top-1 right-1 text-[9px] text-gray-500">
                            {unlock.eloRequired}
                          </span>
                        )}
                        {isSelected && (
                          <span className="absolute top-1 left-1 text-[9px] text-amber-400">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Unlock guide */}
          <div className="px-4 pb-4">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">ELO Tiers</div>
              <div className="space-y-1">
                {ELO_TIERS.map(t => (
                  <div key={t.label} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                    <span style={{ color: t.color }} className="font-semibold w-14">{t.label}</span>
                    <span className="text-gray-500">
                      {t.min === 0 ? 'Default' : `${t.min}+ ELO`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
