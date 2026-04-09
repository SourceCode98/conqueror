export type ResourceType = 'timber' | 'clay' | 'iron' | 'grain' | 'wool';
export type TerrainType = ResourceType | 'desert';
export type ResourceBundle = Record<ResourceType, number>;

export const EMPTY_RESOURCES: ResourceBundle = {
  timber: 0,
  clay: 0,
  iron: 0,
  grain: 0,
  wool: 0,
};

export const ALL_RESOURCES: ResourceType[] = ['timber', 'clay', 'iron', 'grain', 'wool'];
