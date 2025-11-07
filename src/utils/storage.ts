import type { Settings, CustomProfile } from "~src/types";

export const STORAGE_KEYS = {
  API_KEY: 'replyguy_api_key',
  MODEL: 'replyguy_model',
  CUSTOM_PROFILES: 'replyguy_custom_profiles'
};

export const storage = {
  async getSettings(): Promise<Settings> {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.API_KEY,
      STORAGE_KEYS.MODEL
    ]);
    
    console.log('[Storage] getSettings raw result:', result);
    
    return {
      apiKey: result[STORAGE_KEYS.API_KEY] || '',
      model: result[STORAGE_KEYS.MODEL] || 'gpt-3.5-turbo'
    };
  },

  async setApiKey(apiKey: string): Promise<void> {
    console.log('[Storage] setApiKey called with length:', apiKey.length);
    await chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: apiKey });
    console.log('[Storage] setApiKey completed');
  },

  async setModel(model: Settings['model']): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.MODEL]: model });
  },

  async getCustomProfiles(): Promise<CustomProfile[]> {
    const result = await chrome.storage.local.get([STORAGE_KEYS.CUSTOM_PROFILES]);
    return result[STORAGE_KEYS.CUSTOM_PROFILES] || [];
  },

  async saveCustomProfile(profile: CustomProfile): Promise<void> {
    const profiles = await this.getCustomProfiles();
    const existingIndex = profiles.findIndex(p => p.id === profile.id);
    
    if (existingIndex >= 0) {
      profiles[existingIndex] = profile;
    } else {
      profiles.push(profile);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_PROFILES]: profiles });
  },

  async deleteCustomProfile(id: string): Promise<void> {
    const profiles = await this.getCustomProfiles();
    const filtered = profiles.filter(p => p.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_PROFILES]: filtered });
  }
};
