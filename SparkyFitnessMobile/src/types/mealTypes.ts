export interface MealType {
  id: string;
  name: string;
  sort_order: number;
  user_id: string | null;
  created_at: string;
  is_visible: boolean;
}
