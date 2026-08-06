import type { ExternalProvider } from '../../types/externalProviders';
import type { ExternalFoodItem } from '../../types/externalFoods';
import type { FoodItem } from '../../types/foods';
import type { Meal } from '../../types/meals';

// A row in the unified search results. The local foods + meals and the online
// provider results are all rendered in one sectioned list.
export type ResultRow =
  | { type: 'food'; food: FoodItem }
  | { type: 'meal'; meal: Meal }
  | { type: 'online'; online: ExternalFoodItem; providerId?: string }
  | {
      type: 'online-top';
      online: ExternalFoodItem;
      providerName: string;
      providerId?: string;
    }
  | { type: 'show-all'; provider: ExternalProvider; count: number }
  | { type: 'show-all-local'; section: 'foods' | 'meals'; count: number }
  | { type: 'provider-skeleton' }
  | { type: 'local-status'; pending: boolean };

export type ResultSection = {
  key: string;
  title: string | null;
  kind:
    | 'food'
    | 'meal'
    | 'online'
    | 'online-top'
    | 'online-provider'
    | 'label'
    | 'status';
  data: ResultRow[];
  provider?: ExternalProvider;
  count?: number;
  providerLoading?: boolean;
  providerError?: boolean;
  onRetry?: () => void;
};
