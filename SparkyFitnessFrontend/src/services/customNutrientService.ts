import type { UserCustomNutrient } from '../types/customNutrient';
import { api } from './api';

export const customNutrientService = {
  async createCustomNutrient(
    nutrientData: Omit<
      UserCustomNutrient,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >
  ): Promise<UserCustomNutrient> {
    const response = await api.post('/custom-nutrients', {
      body: nutrientData,
    });
    return response;
  },

  async getCustomNutrients(): Promise<UserCustomNutrient[]> {
    const response = await api.get('/custom-nutrients');
    return response; // Directly return the response, as api.get already returns the parsed data
  },

  async getCustomNutrientById(id: string): Promise<UserCustomNutrient> {
    const response = await api.get(`/custom-nutrients/${id}`);
    return response.data;
  },

  async updateCustomNutrient(
    id: string,
    nutrientData: Partial<
      Omit<UserCustomNutrient, 'id' | 'user_id' | 'created_at' | 'updated_at'>
    >
  ): Promise<UserCustomNutrient> {
    const response = await api.put(`/custom-nutrients/${id}`, {
      body: nutrientData,
    });
    return response.data;
  },

  async deleteCustomNutrient(id: string): Promise<void> {
    await api.delete(`/custom-nutrients/${id}`);
  },
};
