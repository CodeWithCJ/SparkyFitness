export interface UserCustomNutrient {
  id: string;
  user_id: string;
  name: string;
  unit: string;
  // Alternate nutrient names online food providers may use for this nutrient,
  // matched (case-insensitively) against provider fields when importing foods.
  aliases: string[];
  created_at: string;
  updated_at: string;
}
