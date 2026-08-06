import type { UserCustomNutrient } from '../../types/customNutrient';
import { api } from '../api';

export interface ResolvedCatalogNutrient {
  catalogId: string;
  /** The custom nutrient's actual name — may be a spelling that pre-dates the catalog. */
  name: string;
  /** Set when the nutrient is a built-in nutrient column rather than a custom nutrient. */
  fixedField?: string;
}

export interface EnsureCatalogNutrientsResponse {
  resolved: ResolvedCatalogNutrient[];
  created: UserCustomNutrient[];
  nutrients: UserCustomNutrient[];
}

export const customNutrientService = {
  async createCustomNutrient(
    nutrientData: Omit<
      UserCustomNutrient,
      'id' | 'user_id' | 'created_at' | 'updated_at' | 'aliases'
    > & {
      aliases?: string[];
      /**
       * Created for a supplement rather than from the Custom Nutrients settings page.
       * The server narrows the display view groups accordingly (goal + reports, not
       * food_database), so the nutrient doesn't become a 0.0 column on every food row.
       */
      forSupplement?: boolean;
    }
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

  // Find-or-create the user's custom nutrients for a set of canonical catalog ids,
  // seeded with the catalog's unit, aliases and Daily Value. Idempotent.
  async ensureCatalogNutrients(
    catalogIds: string[]
  ): Promise<EnsureCatalogNutrientsResponse> {
    const response = await api.post('/custom-nutrients/from-catalog', {
      body: { catalogIds },
    });
    return response;
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

  async deleteCustomNutrient(
    id: string,
    deleteAllHistory: boolean = false
  ): Promise<void> {
    await api.delete(
      `/custom-nutrients/${id}?deleteAllHistory=${deleteAllHistory}`
    );
  },
};
