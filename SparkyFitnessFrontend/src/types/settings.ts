export interface UserPreferencesChat {
  auto_clear_history: string;
}

export interface DataProvider {
  id: string;
  name: string;
  provider_type: string; // e.g., 'wger', 'fatsecret', 'openfoodfacts', 'nutritionix'
  provider_name: string; // e.g., 'Wger', 'FatSecret' (for display and value)
  is_active: boolean; // Changed from is_enabled to is_active
  has_token?: boolean;
  shared_with_public?: boolean;
  is_strictly_private?: boolean;
  base_url?: string;
  app_key: string;
}

export interface WaterContainer {
  id: number;
  user_id: string;
  name: string;
  volume: number;
  unit: 'ml' | 'oz' | 'liter'; // Removed 'cup'
  is_primary: boolean;
  servings_per_container: number; // New field
}

export interface FamilyAccess {
  id: string;
  owner_user_id: string;
  owner_email?: string; // Added owner_email
  family_email: string;
  family_user_id: string;
  family_user_email?: string; // Added family_user_email
  access_permissions: {
    can_manage_diary: boolean;
    can_view_food_library: boolean;
    can_view_exercise_library: boolean;
    can_manage_checkin: boolean; // Added can_manage_checkin
    can_view_reports: boolean; // Added can_view_reports
    share_external_providers: boolean;
  };
  access_end_date: string | null;
  is_active: boolean;
  status: string;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  bio: string | null;
  avatar_url: string | null;
  gender: string | null;
}

export interface ProfileFormState {
  full_name: string;
  phone: string;
  date_of_birth: string;
  bio: string;
  gender: string;
}
