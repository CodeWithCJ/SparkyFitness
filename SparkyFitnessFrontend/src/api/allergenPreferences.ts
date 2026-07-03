import type { UserAllergenPreference } from '../types/allergenPreference';
import { api } from './api';

export const allergenPreferenceService = {
  async getAll(): Promise<UserAllergenPreference[]> {
    return api.get('/allergen-preferences');
  },

  async add(allergenName: string): Promise<UserAllergenPreference> {
    return api.post('/allergen-preferences', {
      body: { allergen_name: allergenName },
    });
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/allergen-preferences/${id}`);
  },
};
