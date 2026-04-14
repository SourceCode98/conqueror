import { create } from 'zustand';

export interface ProfileData {
  id: string;
  username: string;
  elo: number;
  gamesPlayed: number;
  gamesWon: number;
  selectedHorn: string;
  selectedRoadSkin: string;
  selectedBuildingSkin: string;
  unlocks: string[];
}

interface ProfileStore {
  profile: ProfileData | null;
  fetchProfile: (token: string) => Promise<void>;
  updateCosmetics: (token: string, patch: {
    selectedHorn?: string;
    selectedRoadSkin?: string;
    selectedBuildingSkin?: string;
  }) => Promise<void>;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: null,

  fetchProfile: async (token) => {
    const res = await fetch('/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      set({ profile: data });
    }
  },

  updateCosmetics: async (token, patch) => {
    const res = await fetch('/api/profile/cosmetics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      set(s => ({
        profile: s.profile ? { ...s.profile, ...patch } : s.profile,
      }));
    }
  },
}));
