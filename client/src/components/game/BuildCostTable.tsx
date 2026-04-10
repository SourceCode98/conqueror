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

const ITEMS: CostItem[] = [
  {
    label: 'Road',
    icon: '🛣',
    cost: { timber: 1, clay: 1 },
  },
  {
    label: 'Settlement',
    icon: '🏠',
    vp: 1,
    cost: { timber: 1, clay: 1, grain: 1, wool: 1 },
  },
  {
    label: 'City',
    icon: '🏙',
    vp: 2,
    cost: { iron: 3, grain: 2 },
    note: 'Upgrade settlement',
  },
  {
    label: 'Dev Card',
    icon: '🃏',
    cost: { iron: 1, grain: 1, wool: 1 },
  },
];

const SPECIAL: Array<{ label: string; icon: string; vp: number; note: string }> = [
  { label: 'Grand Road', icon: '🛣', vp: 2, note: '5+ connected roads' },
  { label: 'Supreme Army', icon: '⚔️', vp: 2, note: '3+ knights played' },
  { label: 'Victory Point', icon: '⭐', vp: 1, note: 'Dev card — hidden until win' },
];

interface Props {
  onClose?: () => void;
}

export default function BuildCostTable({ onClose }: Props) {
  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-2xl p-3 shadow-2xl backdrop-blur-sm w-52">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Build Costs</span>
        {onClose && (
          <button className="text-gray-600 hover:text-white text-xs" onClick={onClose}>✕</button>
        )}
      </div>

      <div className="space-y-1.5">
        {ITEMS.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-gray-200">{item.label}</span>
                {item.vp && (
                  <span className="text-[9px] bg-amber-800/60 text-amber-300 rounded px-1">{item.vp}VP</span>
                )}
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
        ))}
      </div>

      <div className="border-t border-gray-700 mt-2 pt-2 space-y-1">
        <span className="text-[9px] text-gray-500 uppercase tracking-widest">Special Cards</span>
        {SPECIAL.map(s => (
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
      </div>
    </div>
  );
}
