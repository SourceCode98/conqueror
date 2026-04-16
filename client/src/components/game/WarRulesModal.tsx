/**
 * War & Sieges rules modal — visual layout, minimal text.
 */
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
  variants?: {
    totalWar?: boolean;
    fortress?: boolean;
    reconstruction?: boolean;
    soldierFoodEnabled?: boolean;
    coliseum?: boolean;
  };
}

// ── Small reusable atoms ──────────────────────────────────────────────────────

function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'gray' }) {
  const colors = {
    red:    'bg-red-900/60 text-red-300 border-red-700/50',
    amber:  'bg-amber-900/60 text-amber-300 border-amber-700/50',
    blue:   'bg-blue-900/60 text-blue-300 border-blue-700/50',
    green:  'bg-green-900/60 text-green-300 border-green-700/50',
    purple: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
    gray:   'bg-gray-800 text-gray-300 border-gray-700',
  };
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${colors[color]}`}>
      {children}
    </span>
  );
}

function Arrow() {
  return <span className="text-gray-500 text-xs mx-0.5">→</span>;
}

function Stat({ icon, value, label }: { icon: string; value: string | number; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-gray-800/60 rounded-xl px-3 py-2 border border-gray-700/50 min-w-[56px]">
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-sm font-bold text-white tabular-nums">{value}</span>
      {label && <span className="text-[9px] text-gray-500 text-center leading-tight">{label}</span>}
    </div>
  );
}

function Section({ icon, title, color = 'gray', children }: { icon: string; title: string; color?: 'red' | 'amber' | 'purple' | 'gray'; children: React.ReactNode }) {
  const border = { red: 'border-red-900/40', amber: 'border-amber-900/40', purple: 'border-purple-900/40', gray: 'border-gray-800' };
  const titleColor = { red: 'text-red-300', amber: 'text-amber-300', purple: 'text-purple-300', gray: 'text-gray-200' };
  return (
    <div className={`rounded-xl border ${border[color]} bg-gray-800/30 p-3 space-y-2.5`}>
      <div className="flex items-center gap-1.5">
        <span className="text-base">{icon}</span>
        <span className={`text-xs font-bold uppercase tracking-wide ${titleColor[color]}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WarRulesModal({ onClose, variants }: Props) {
  const { t } = useTranslation('game');
  const hasFood = variants?.soldierFoodEnabled !== false;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative z-10 bg-gray-900 border border-red-800/60 rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] overflow-y-auto"
          initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 20 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-gray-900 border-b border-red-900/50 px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚔️</span>
              <div>
                <h2 className="text-white font-bold text-sm leading-tight">{t('warRules.title')}</h2>
                <p className="text-red-400 text-[10px]">{t('warRules.subtitle')}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg px-1">✕</button>
          </div>

          <div className="px-4 py-3 space-y-3">

            {/* Active variants */}
            {(variants?.totalWar || variants?.fortress || variants?.reconstruction || !hasFood || variants?.coliseum) && (
              <div className="flex flex-wrap gap-1.5">
                {variants?.totalWar      && <Badge color="red">🔥 {t('warRules.variantLabels.totalWar')}</Badge>}
                {variants?.fortress      && <Badge color="blue">🏰 {t('warRules.variantLabels.fortress')}</Badge>}
                {variants?.reconstruction && <Badge color="green">🏚️ {t('warRules.variantLabels.reconstruction')}</Badge>}
                {!hasFood                && <Badge color="amber">🌾 {t('warRules.variantLabels.noFood')}</Badge>}
                {variants?.coliseum      && <Badge color="purple">🏟️ {t('warRules.variantLabels.coliseum')}</Badge>}
              </div>
            )}

            {/* ── Soldiers ── */}
            <Section icon="🪖" title={t('warRules.sections.soldiers.title')} color="gray">
              {/* Capacity */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1.5 border border-gray-700">
                  <span>🏠</span>
                  <Arrow />
                  <span>🪖🪖</span>
                  <span className="text-[10px] text-gray-500 ml-1">max 2</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1.5 border border-gray-700">
                  <span>🏙️</span>
                  <Arrow />
                  <span>🪖🪖🪖</span>
                  <span className="text-[10px] text-gray-500 ml-1">max 3</span>
                </div>
              </div>
              {/* Cost + upkeep */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="text-[10px] text-gray-500">{t('warRules.buy')}</span>
                  <span>🪖</span><span>=</span>
                  <span>🔩</span><span>🌾</span><span>🐑</span>
                </div>
                {hasFood && (
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span className="text-[10px] text-gray-500">|</span>
                    <span>🪖🪖</span><Arrow /><span>1🌾</span>
                    <span className="text-[10px] text-gray-500">{t('warRules.perTurn')}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <span className="text-[10px] text-gray-500">|</span>
                  <span>{t('warRules.move')}</span>
                  <Badge color="gray">≤ 2 🛣️</Badge>
                </div>
              </div>
            </Section>

            {/* ── Attacking ── */}
            <Section icon="⚔️" title={t('warRules.sections.attacking.title')} color="red">
              {/* Range */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color="gray">≤ 2 🛣️ {t('warRules.range')}</Badge>
                <span className="text-[10px] text-gray-500">{t('warRules.afterRoll')}</span>
              </div>
              {/* Battle formula */}
              <div className="bg-gray-900/60 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500 text-[10px] w-16 shrink-0">{t('warRules.attacker')}</span>
                  <span>🎲</span><span className="text-gray-500">+</span><span>🪖</span>
                  <Badge color="amber">+1 {t('warRules.perSoldier')}</Badge>
                  <Badge color="gray">max +5</Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500 text-[10px] w-16 shrink-0">{t('warRules.defender')}</span>
                  <span>🎲</span><span className="text-gray-500">+</span><span>🪖</span>
                  <Badge color="amber">+1 {t('warRules.perSoldier')}</Badge>
                  <span className="text-gray-500 text-[9px]">| 🏙️</span>
                  <Badge color="blue">+1</Badge>
                </div>
              </div>
              {/* Outcomes */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-green-900/20 border border-green-900/40 rounded-lg p-2 text-center">
                  <div className="text-lg">🏆</div>
                  <div className="text-[10px] text-green-300 font-semibold">{t('warRules.win')}</div>
                  <div className="text-[9px] text-gray-500">{t('warRules.winDesc')}</div>
                </div>
                <div className="bg-red-900/20 border border-red-900/40 rounded-lg p-2 text-center">
                  <div className="text-lg">🛡️</div>
                  <div className="text-[10px] text-red-300 font-semibold">{t('warRules.repelled')}</div>
                  <div className="text-[9px] text-gray-500">{t('warRules.repelledDesc')}</div>
                </div>
              </div>
            </Section>

            {/* ── Siege ── */}
            <Section icon="🔴" title={t('warRules.sections.siege.title')} color="red">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-xs">
                  <span>{t('warRules.winOrDraw')}</span><Arrow />
                  <span className="text-red-400 font-bold">🔴 {t('warRules.siege')}</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Badge color="red">❌ {t('warRules.noBuilding')}</Badge>
                <Badge color="red">❌ {t('warRules.noPortTrade')}</Badge>
                <Badge color="gray">⏱️ {t('warRules.nextTurn')}</Badge>
              </div>
            </Section>

            {/* ── Destruction ── */}
            <Section icon="💥" title={t('warRules.sections.destruction.title')} color="amber">
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <span className="text-[10px] text-gray-500">{t('warRules.winVsSieged')}</span>
                <Arrow />
                <span className="font-bold text-amber-300">💥</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center gap-1.5 bg-gray-800/60 rounded-lg px-2.5 py-2 border border-gray-700">
                  <span>🏙️</span><Arrow /><span>🏠</span>
                  <Badge color="red">−1VP</Badge>
                </div>
                <div className="flex items-center gap-1.5 bg-gray-800/60 rounded-lg px-2.5 py-2 border border-gray-700">
                  <span>🏠</span><Arrow /><span>💥</span>
                  <Badge color="red">−1VP</Badge>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span>🛣️</span>
                <span>{t('warRules.roadsTransfer')}</span>
              </div>
              {variants?.fortress && (
                <div className="flex items-center gap-1.5">
                  <Badge color="blue">🏰 {t('warRules.fortress2wins')}</Badge>
                </div>
              )}
            </Section>

            {/* ── Warlord ── */}
            <Section icon="🏆" title={t('warRules.sections.warlord.title')} color="amber">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2.5 py-1.5 border border-gray-700 text-sm">
                  <span>2×🏠</span>
                  <span className="text-gray-600 text-xs">or</span>
                  <span>1×🏙️</span>
                </div>
                <Arrow />
                <div className="flex items-center gap-1">
                  <span>🗡️</span>
                  <Badge color="amber">+2VP</Badge>
                </div>
              </div>
              {variants?.totalWar && (
                <Badge color="red">🔥 {t('warRules.unlimitedAttacks')}</Badge>
              )}
              <div className="text-[10px] text-gray-500">{t('warRules.canBeStolen')}</div>
            </Section>

            {/* ── Coliseum ── */}
            {variants?.coliseum && (
              <Section icon="🏟️" title={t('warRules.sections.coliseum.title')} color="purple">
                <div className="flex gap-2 flex-wrap">
                  <Stat icon="⚔️" value="1v1" label={t('warRules.realtime')} />
                  <Stat icon="🏆" value="3" label={t('warRules.roundsToWin')} />
                  <Stat icon="❤️" value="+30" label={t('warRules.hpPerSoldier')} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge color="purple">{t('warRules.noRollDice')}</Badge>
                  <Badge color="purple">⚡ {t('warRules.fasterAttack')}</Badge>
                  <Badge color="purple">🛣️ {t('warRules.roadsTransfer')}</Badge>
                </div>
              </Section>
            )}

            {/* ── Reconstruction variant ── */}
            {variants?.reconstruction && (
              <div className="flex items-center gap-2 bg-green-900/10 border border-green-900/40 rounded-xl px-3 py-2">
                <span>🏚️</span><Arrow /><span>🏠</span>
                <span className="text-[10px] text-gray-400 ml-1">{t('warRules.rebuildCost')}</span>
                <div className="flex gap-0.5 ml-auto">
                  <span>🪵🪵</span><span>🧱🧱</span>
                </div>
              </div>
            )}

          </div>

          <div className="px-4 pb-4">
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
