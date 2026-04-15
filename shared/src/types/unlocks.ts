export interface UnlockDefinition {
  id: string;
  type: 'horn' | 'road' | 'building';
  eloRequired: number;
  label: string;
}

export const UNLOCKS: UnlockDefinition[] = [
  // Horn sounds
  { id: 'horn_default', type: 'horn', eloRequired: 0,    label: 'Default Horn' },
  { id: 'horn_fanfare', type: 'horn', eloRequired: 1050, label: 'Fanfare Horn' },
  { id: 'horn_royal',   type: 'horn', eloRequired: 1200, label: 'Royal Fanfare' },
  { id: 'horn_war',     type: 'horn', eloRequired: 1400, label: 'War Horn' },
  // Road skins
  { id: 'road_default', type: 'road', eloRequired: 0,    label: 'Dirt Path' },
  { id: 'road_iron',    type: 'road', eloRequired: 1050, label: 'Rustic Trail' },
  { id: 'road_stone',   type: 'road', eloRequired: 1200, label: 'Cobblestone' },
  { id: 'road_gold',    type: 'road', eloRequired: 1400, label: 'Royal Road' },
  // Building skins
  { id: 'building_default', type: 'building', eloRequired: 0,    label: 'Wooden Hut' },
  { id: 'building_iron',    type: 'building', eloRequired: 1050, label: 'Rustic Cabin' },
  { id: 'building_stone',   type: 'building', eloRequired: 1200, label: 'Stone Keep' },
  { id: 'building_gold',    type: 'building', eloRequired: 1400, label: 'Grand Fortress' },
];

export const ELO_TIERS = [
  { label: 'Rookie',  min: 0,    max: 1049, color: '#9ca3af' },
  { label: 'Bronze',  min: 1050, max: 1199, color: '#cd7f32' },
  { label: 'Silver',  min: 1200, max: 1399, color: '#94a3b8' },
  { label: 'Gold',    min: 1400, max: Infinity, color: '#f59e0b' },
] as const;

export function getTier(elo: number): typeof ELO_TIERS[number] {
  let tier: typeof ELO_TIERS[number] = ELO_TIERS[0];
  for (const t of ELO_TIERS) {
    if (elo >= t.min) tier = t;
  }
  return tier;
}

export function getUnlockedIds(elo: number): string[] {
  return UNLOCKS.filter(u => elo >= u.eloRequired).map(u => u.id);
}
