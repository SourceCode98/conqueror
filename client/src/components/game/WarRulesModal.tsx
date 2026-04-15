/**
 * Modal explaining War & Sieges mode rules.
 * Auto-shown when the game starts in war mode; re-openable via "?" button.
 */
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
  variants?: { totalWar?: boolean; fortress?: boolean; reconstruction?: boolean; soldierFoodEnabled?: boolean; coliseum?: boolean };
}

const SECTION_KEYS = ['soldiers', 'attacking', 'siege', 'destruction', 'warlord'] as const;
const SECTION_ICONS: Record<string, string> = {
  soldiers: '🪖',
  attacking: '⚔️',
  siege: '🔴',
  destruction: '💥',
  warlord: '🏆',
};
const VARIANT_KEYS = ['totalWar', 'fortress', 'reconstruction', 'coliseum'] as const;

export default function WarRulesModal({ onClose, variants }: Props) {
  const { t } = useTranslation('game');

  const activeVariants = VARIANT_KEYS.filter(k => variants?.[k]);
  const noFoodActive = variants?.soldierFoodEnabled === false;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Panel */}
        <motion.div
          className="relative z-10 bg-gray-900 border border-red-800/60 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 20 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-gray-900 border-b border-red-900/50 px-5 py-4 flex items-center justify-between rounded-t-2xl">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚔️</span>
              <div>
                <h2 className="text-white font-bold text-base leading-tight">{t('warRules.title')}</h2>
                <p className="text-red-400 text-xs">{t('warRules.subtitle')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors text-xl leading-none px-2"
            >
              ✕
            </button>
          </div>

          <div className="px-5 py-4 space-y-5">
            {/* Active variants */}
            {(activeVariants.length > 0 || noFoodActive) && (
              <div className="space-y-1.5">
                {activeVariants.map(k => (
                  <div key={k} className="text-xs text-orange-300 bg-orange-900/20 border border-orange-800/40 rounded-lg px-3 py-1.5">
                    {t(`warRules.variants.${k}`)}
                  </div>
                ))}
                {noFoodActive && (
                  <div className="text-xs text-blue-300 bg-blue-900/20 border border-blue-800/40 rounded-lg px-3 py-1.5">
                    {t('warRules.variants.noFood')}
                  </div>
                )}
              </div>
            )}

            {/* Coliseum section — shown only when coliseum variant is active */}
            {variants?.coliseum && (() => {
              const lines = t('warRules.sections.coliseum.lines', { returnObjects: true }) as string[];
              return (
                <div className="border border-purple-800/50 rounded-xl p-3 bg-purple-900/10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">🏟️</span>
                    <h3 className="text-sm font-bold text-purple-300">{t('warRules.sections.coliseum.title')}</h3>
                  </div>
                  <ul className="space-y-1 pl-7">
                    {lines.map((line, i) => (
                      <li key={i} className="text-xs text-purple-200/70 leading-relaxed list-disc list-outside">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* Rule sections */}
            {SECTION_KEYS.map(key => {
              const lines = t(`warRules.sections.${key}.lines`, { returnObjects: true }) as string[];
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{SECTION_ICONS[key]}</span>
                    <h3 className="text-sm font-bold text-gray-100">{t(`warRules.sections.${key}.title`)}</h3>
                  </div>
                  <ul className="space-y-1 pl-7">
                    {lines.map((line, i) => (
                      <li key={i} className="text-xs text-gray-400 leading-relaxed list-disc list-outside">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="px-5 pb-4">
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-red-900/40 border border-red-700 text-red-300 py-2.5 text-sm font-semibold hover:bg-red-800/50 transition-colors"
            >
              {t('warRules.close')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
