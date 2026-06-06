import { log } from '../../config/logging.js';

export interface NorishRecipeIngredient {
  id: string;
  ingredientId: string | null;
  amount: number | null;
  unit: string | null;
  order: number;
  systemUsed: 'metric' | 'us';
  version: number;
  ingredientName: string;
}

export interface NorishRecipeStep {
  step: string;
  systemUsed: 'metric' | 'us';
  order: number;
  version: number;
}

export interface NorishRecipe {
  id: string;
  userId?: string | null;
  name: string;
  description?: string | null;
  image?: string | null;
  url?: string | null;
  servings: number;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  totalMinutes?: number | null;
  notes?: string | null;
  systemUsed: 'metric' | 'us';
  calories?: number | null;
  fat?: string | number | null;
  carbs?: string | number | null;
  protein?: string | number | null;
  createdAt: string;
  updatedAt: string;
  categories: Array<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'>;
  version: number;
  recipeIngredients: NorishRecipeIngredient[];
  steps: NorishRecipeStep[];
}

export interface SparkyFoodMapping {
  food: {
    name: string;
    brand: string | null;
    is_custom: boolean;
    user_id: string;
    shared_with_public: boolean;
    provider_external_id: string;
    provider_type: string;
    is_quick_food: boolean;
  };
  variant: {
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    saturated_fat: number;
    polyunsaturated_fat: number;
    monounsaturated_fat: number;
    trans_fat: number;
    cholesterol: number;
    sodium: number;
    potassium: number;
    dietary_fiber: number;
    sugars: number;
    vitamin_a: number;
    vitamin_c: number;
    calcium: number;
    iron: number;
    is_default: boolean;
  };
}

class NorishService {
  accessToken: string;
  baseUrl: string;

  constructor(baseUrl?: string | null, apiKey?: string | null) {
    if (baseUrl) {
      let cleaned = baseUrl.trim();
      if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
        cleaned = `https://${cleaned}`;
      }
      cleaned = cleaned.endsWith('/') ? cleaned.slice(0, -1) : cleaned;
      if (!cleaned.endsWith('/api/v1')) {
        this.baseUrl = `${cleaned}/api/v1`;
      } else {
        this.baseUrl = cleaned;
      }
    } else {
      this.baseUrl = 'https://norish.example.com/api/v1';
    }
    this.accessToken = apiKey || '';
  }

  async searchRecipes(
    query: string,
    options: RequestInit = {}
  ): Promise<NorishRecipe[]> {
    if (!this.accessToken) {
      throw new Error('Norish API key not provided.');
    }
    const url = `${this.baseUrl}/recipes/search`;
    try {
      const authHeaders: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      if (this.accessToken.startsWith('Bearer ')) {
        authHeaders['Authorization'] = this.accessToken;
      } else {
        authHeaders['x-api-key'] = this.accessToken;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...authHeaders,
          ...options.headers,
        } as HeadersInit,
        body: JSON.stringify({
          search: query,
          limit: 10,
          cursor: 0,
        }),
      });

      log(
        'debug',
        `Norish search HTTP status: ${response.status} ${response.statusText}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        log('error', `Norish API Error Response (Raw): ${errorText}`);
        throw new Error(
          `Search failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      if (data && Array.isArray(data.recipes)) {
        return data.recipes;
      }
      return [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log('error', `Error during Norish recipe search: ${msg}`);
      return [];
    }
  }

  async getRecipeDetails(
    id: string,
    options: RequestInit = {}
  ): Promise<NorishRecipe | null> {
    if (!this.accessToken) {
      throw new Error('Norish API key not provided.');
    }
    const url = `${this.baseUrl}/recipes/${encodeURIComponent(id)}`;
    try {
      const authHeaders: Record<string, string> = {
        Accept: 'application/json',
      };

      if (this.accessToken.startsWith('Bearer ')) {
        authHeaders['Authorization'] = this.accessToken;
      } else {
        authHeaders['x-api-key'] = this.accessToken;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...authHeaders,
          ...options.headers,
        } as HeadersInit,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Get recipe details failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data: NorishRecipe = await response.json();
      log('debug', `Successfully retrieved details for Norish recipe: ${id}`);
      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log('error', `Error during Norish recipe details retrieval: ${msg}`);
      return null;
    }
  }

  mapNorishRecipeToSparkyFood(
    norishRecipe: NorishRecipe,
    userId: string
  ): SparkyFoodMapping {
    log(
      'debug',
      `[Norish Mapping] Starting mapping for recipe ID: ${norishRecipe.id} ("${norishRecipe.name}")`
    );

    const parseNutrientValue = (
      val: string | number | null | undefined
    ): number => {
      if (val === null || val === undefined || val === '') return 0;
      if (typeof val === 'number') return val;
      const parsed = parseFloat(val.replace(/[^\d.]/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    };

    const calories = norishRecipe.calories || 0;
    const protein = parseNutrientValue(norishRecipe.protein);
    const carbs = parseNutrientValue(norishRecipe.carbs);
    const fat = parseNutrientValue(norishRecipe.fat);

    return {
      food: {
        name: norishRecipe.name,
        brand: (() => {
          if (!norishRecipe.url) return null;
          try {
            return new URL(norishRecipe.url).hostname;
          } catch {
            return null;
          }
        })(),
        is_custom: true,
        user_id: userId,
        shared_with_public: false,
        provider_external_id: norishRecipe.id,
        provider_type: 'norish',
        is_quick_food: false,
      },
      variant: {
        serving_size: 1,
        serving_unit: 'serving',
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        saturated_fat: 0,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        sodium: 0,
        potassium: 0,
        dietary_fiber: 0,
        sugars: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 0,
        iron: 0,
        is_default: true,
      },
    };
  }
}

export default NorishService;
