/**
 * Reference build cost table, like the card in the original Catan box.
 * Shows road/settlement/city/dev card costs and special card conditions.
 */
import type { ResourceType } from '@conqueror/shared';
import { RESOURCE_ICON_MAP } from '../icons/GameIcons.js';

interface CostItem {
  label: string;
  icon: string;
  vp?: number;
  cost: Partial<Record<ResourceType, number>>;
  note?: string;
}

const BASE_ITEMS: CostItem[] = [
  { label: 'Road',       icon: '🛣', cost: { timber: 1, clay: 1 } },
  { label: 'Settlement', icon: '🏠', vp: 1, cost: { timber: 1, clay: 1, grain: 1, wool: 1 } },
  { label: 'City',       icon: '🏙', vp: 2, cost: { iron: 3, grain: 2 }, note: 'Upgrade settlement' },
  { label: 'Dev Card',   icon: '🃏', cost: { iron: 1, grain: 1, wool: 1 } },
];

const BASE_SPECIAL: Array<{ label: string; icon: string; vp: number; note: string }> = [
  { label: 'Grand Road',    icon: '🛣',  vp: 2, note: '5+ connected roads' },
  { label: 'Supreme Army',  icon: '⚔️', vp: 2, note: '3+ knights played' },
  { label: 'Victory Point', icon: '⭐', vp: 1, note: 'Dev card — hidden until win' },
];

const WAR_RULES = [
  { icon: '🪖', text: 'Soldier limit: 2 per settlement, 3 per city' },
  { icon: '⚔️', text: 'Attack range: max 2 roads away (need road connection)' },
  { icon: '🔴', text: 'Siege: no resources, no build, no recruit' },
  { icon: '🛡️', text: 'Tie in combat → defender wins' },
  { icon: '💥', text: 'Destroy 2nd time only if already sieged' },
  { icon: '⚠️', text: 'Cannot attack players with ≤ 2 VP' },
  { icon: '⚠️', text: 'Cannot destroy last building of a player' },
  { icon: '🌾', text: 'Maintenance: every 2 soldiers costs 1 grain/turn' },
  { icon: '🛡️', text: 'Soldiers protect adjacent buildings from bandit' },
];

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
  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-2xl p-3 shadow-2xl backdrop-blur-sm w-56 max-h-[80dvh] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Build Costs</span>
        {onClose && <button className="text-gray-600 hover:text-white text-xs" onClick={onClose}>✕</button>}
      </div>

      <div className="space-y-1.5">
        {BASE_ITEMS.map(item => <CostRow key={item.label} item={item}/>)}

        {/* War mode costs */}
        {warMode && (
          <>
            <div className="border-t border-red-900/50 mt-1 pt-1.5">
              <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">⚔️ War Mode</span>
            </div>
            <CostRow item={{ label: 'Soldier', icon: '🪖', cost: { iron: 1, grain: 1, wool: 1 }, note: 'Place on building' }}/>
            {warVariants?.reconstruction && (
              <CostRow item={{ label: 'Rebuild', icon: '🏚️', cost: { timber: 2, clay: 2 }, note: 'Destroyed settlement' }}/>
            )}
          </>
        )}
      </div>

      {/* Special cards */}
      <div className="border-t border-gray-700 mt-2 pt-2 space-y-1">
        <span className="text-[9px] text-gray-500 uppercase tracking-widest">Special Cards</span>
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
                <span className="text-[10px] font-semibold text-gray-300">Warlord</span>
                <span className="text-[9px] bg-amber-800/60 text-amber-300 rounded px-1">+2VP</span>
              </div>
              <span className="text-[9px] text-gray-500">Destroy 2 settlements or 1 city</span>
            </div>
          </div>
        )}
      </div>

      {/* War rules reference */}
      {warMode && (
        <div className="border-t border-red-900/40 mt-2 pt-2">
          <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">War Rules</span>
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
                <span className="text-[9px] text-orange-400 leading-tight">Total War: no attack limit per turn</span>
              </div>
            )}
            {warVariants?.fortress && (
              <div className="flex items-start gap-1.5">
                <span className="text-[10px] shrink-0">🏰</span>
                <span className="text-[9px] text-blue-400 leading-tight">Fortress: cities need 2 wins to downgrade</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
