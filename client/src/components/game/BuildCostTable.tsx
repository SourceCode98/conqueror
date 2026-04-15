/**
 * Reference build cost table, like the card in the original Catan box.
 * Shows road/settlement/city/dev card costs and special card conditions.
 */
import { useTranslation } from 'react-i18next';
import type { ResourceType } from '@conqueror/shared';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';

interface CostItem {
  label: string;
  icon: string;
  vp?: number;
  cost: Partial<Record<ResourceType, number>>;
  note?: string;
}

interface Props {
  onClose?: () => void;
  warMode?: boolean;
  warVariants?: { totalWar?: boolean; fortress?: boolean; reconstruction?: boolean };
}

function CostRow({ item }: { item: CostItem }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-gray-200">{item.label}</span>
          {item.vp && <span className="text-[9px] bg-amber-800/60 text-amber-300 rounded px-1">{item.vp}VP</span>}
          {item.note && <span className="text-[9px] text-gray-500 truncate">{item.note}</span>}
        </div>
        <div className="flex gap-0.5 flex-wrap mt-0.5">
          {(Object.entries(item.cost) as [ResourceType, number][]).map(([r, n]) => (
            <div key={r} className="flex items-center gap-0.5">
              {Array.from({ length: n }, (_, i) => (
                <span key={i}>{RESOURCE_ICON_MAP[r]?.({ size: 12 })}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BuildCostTable({ onClose, warMode, warVariants }: Props) {
  const { t } = useTranslation('game');

  const BASE_ITEMS: CostItem[] = [
    { label: t('buildCost.road'),       icon: '🛣', cost: { timber: 1, clay: 1 } },
    { label: t('buildCost.settlement'), icon: '🏠', vp: 1, cost: { timber: 1, clay: 1, grain: 1, wool: 1 } },
    { label: t('buildCost.city'),       icon: '🏙', vp: 2, cost: { iron: 3, grain: 2 }, note: t('buildCost.upgradeSettlement') },
    { label: t('buildCost.devCard'),    icon: '🃏', cost: { iron: 1, grain: 1, wool: 1 } },
  ];

  const BASE_SPECIAL = [
    { label: t('buildCost.grandRoad'),    icon: '🛣',  vp: 2, note: t('buildCost.connectedRoads') },
    { label: t('buildCost.supremeArmy'), icon: '⚔️', vp: 2, note: t('buildCost.knightsPlayed') },
    { label: t('buildCost.victoryPoint'), icon: '⭐', vp: 1, note: t('buildCost.devCardHidden') },
  ];

  const WAR_RULES = [
    { icon: '🪖', text: t('buildCost.rules.soldierLimit') },
    { icon: '⚔️', text: t('buildCost.rules.attackRange') },
    { icon: '🔴', text: t('buildCost.rules.siegeRule') },
    { icon: '🛡️', text: t('buildCost.rules.tieDefends') },
    { icon: '💥', text: t('buildCost.rules.destroy2nd') },
    { icon: '⚠️', text: t('buildCost.rules.noAttackLowVP') },
    { icon: '⚠️', text: t('buildCost.rules.noDestroyLast') },
    { icon: '🌾', text: t('buildCost.rules.maintenanceRule') },
    { icon: '🛡️', text: t('buildCost.rules.soldiersProtect') },
  ];

  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-2xl p-3 shadow-2xl backdrop-blur-sm w-56 max-h-[80dvh] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('buildCost.title')}</span>
        {onClose && <button className="text-gray-600 hover:text-white text-xs" onClick={onClose}>✕</button>}
      </div>

      <div className="space-y-1.5">
        {BASE_ITEMS.map(item => <CostRow key={item.label} item={item}/>)}

        {/* War mode costs */}
        {warMode && (
          <>
            <div className="border-t border-red-900/50 mt-1 pt-1.5">
              <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">{t('buildCost.warModeTitle')}</span>
            </div>
            <CostRow item={{ label: t('buildCost.soldier'), icon: '🪖', cost: { iron: 1, grain: 1, wool: 1 }, note: t('buildCost.placeOnBuilding') }}/>
            {warVariants?.reconstruction && (
              <CostRow item={{ label: t('buildCost.rebuild'), icon: '🏚️', cost: { timber: 2, clay: 2 }, note: t('buildCost.destroyedSettlement') }}/>
            )}
          </>
        )}
      </div>

      {/* Special cards */}
      <div className="border-t border-gray-700 mt-2 pt-2 space-y-1">
        <span className="text-[9px] text-gray-500 uppercase tracking-widest">{t('buildCost.specialCards')}</span>
        {BASE_SPECIAL.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="text-sm w-5 text-center shrink-0">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-gray-300">{s.label}</span>
                <span className="text-[9px] bg-amber-800/60 text-amber-300 rounded px-1">+{s.vp}VP</span>
              </div>
              <span className="text-[9px] text-gray-500">{s.note}</span>
            </div>
          </div>
        ))}
        {warMode && (
          <div className="flex items-center gap-2">
            <span className="text-sm w-5 text-center shrink-0">🗡️</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-gray-300">{t('buildCost.warlord')}</span>
                <span className="text-[9px] bg-amber-800/60 text-amber-300 rounded px-1">+2VP</span>
              </div>
              <span className="text-[9px] text-gray-500">{t('buildCost.destroyForTitle')}</span>
            </div>
          </div>
        )}
      </div>

      {/* War rules reference */}
      {warMode && (
        <div className="border-t border-red-900/40 mt-2 pt-2">
          <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">{t('buildCost.warRulesTitle')}</span>
          <div className="mt-1 space-y-1">
            {WAR_RULES.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-[10px] shrink-0 mt-0.5">{r.icon}</span>
                <span className="text-[9px] text-gray-400 leading-tight">{r.text}</span>
              </div>
            ))}
            {warVariants?.totalWar && (
              <div className="flex items-start gap-1.5">
                <span className="text-[10px] shrink-0">🔥</span>
                <span className="text-[9px] text-orange-400 leading-tight">{t('buildCost.rules.totalWar')}</span>
              </div>
            )}
            {warVariants?.fortress && (
              <div className="flex items-start gap-1.5">
                <span className="text-[10px] shrink-0">🏰</span>
                <span className="text-[9px] text-blue-400 leading-tight">{t('buildCost.rules.fortress')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
