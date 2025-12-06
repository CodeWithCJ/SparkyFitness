import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import ConfirmationDialog from "@/components/ui/ConfirmationDialog";
import {
  isUUID,
  saveFood,
  loadFoodVariants, // Also re-add loadFoodVariants as it's used
} from "@/services/enhancedCustomFoodFormService";
import { updateFoodEntriesSnapshot } from "@/services/foodService";
import { Food, FoodVariant, GlycemicIndex } from "@/types/food";

type NumericFoodVariantKeys = Exclude<
  keyof FoodVariant,
  "id" | "serving_unit" | "is_default" | "is_locked" | "glycemic_index"
>;

const nutrientFields: NumericFoodVariantKeys[] = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "saturated_fat",
  "polyunsaturated_fat",
  "monounsaturated_fat",
  "trans_fat",
  "cholesterol",
  "sodium",
  "potassium",
  "dietary_fiber",
  "sugars",
  "vitamin_a",
  "vitamin_c",
  "calcium",
  "iron",
];

const sanitizeGlycemicIndexFrontend = (gi: string | null | undefined): GlycemicIndex => {
  const allowedGICategories: GlycemicIndex[] = ['None', 'Very Low', 'Low', 'Medium', 'High', 'Very High'];
  if (gi === null || gi === undefined || gi === '' || gi === "0" || gi === "0.0" || !allowedGICategories.includes(gi as GlycemicIndex)) {
    return "None";
  }
  return gi as GlycemicIndex;
};

interface EnhancedCustomFoodFormProps {
  onSave: (foodData: any) => void;
  food?: Food;
  initialVariants?: FoodVariant[]; // New prop for pre-populating variants
  visibleNutrients?: string[];
}

const COMMON_UNITS = [
  "g",
  "kg",
  "mg",
  "oz",
  "lb",
  "ml",
  "l",
  "cup",
  "tbsp",
  "tsp",
  "piece",
  "slice",
  "serving",
  "can",
  "bottle",
  "packet",
  "bag",
  "bowl",
  "plate",
  "handful",
  "scoop",
  "bar",
  "stick",
];

const EnhancedCustomFoodForm = ({
  onSave,
  food,
  initialVariants,
  visibleNutrients: passedVisibleNutrients,
}: EnhancedCustomFoodFormProps) => {
  const { user } = useAuth();
  const { nutrientDisplayPreferences, energyUnit, convertEnergy } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? "mobile" : "desktop";
  
  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? "kcal" : "kJ"; // Using simple strings here, can be replaced with t() if i18n is available
  };
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<FoodVariant[]>([]);
  const [originalVariants, setOriginalVariants] = useState<FoodVariant[]>([]); // State to hold original, immutable variants
  const [variantErrors, setVariantErrors] = useState<string[]>([]); // State to hold errors for each variant
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [syncFoodId, setSyncFoodId] = useState<string | null>(null);
 
  const foodDatabasePreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === "food_database" && p.platform === platform
  );
  const visibleNutrients =
    passedVisibleNutrients ||
    (foodDatabasePreferences
      ? foodDatabasePreferences.visible_nutrients
      : Object.keys(variants[0] || {}));
  const [formData, setFormData] = useState<{
    name: string;
    brand: string;
    is_quick_food: boolean;
  }>({
    name: "",
    brand: "",
    is_quick_food: false,
  });

  useEffect(() => {
    if (food) {
      setFormData({
        name: food.name || "",
        brand: food.brand || "",
        is_quick_food: food.is_quick_food || false,
      });
      if (food.variants && food.variants.length > 0) {
        const mappedVariants = food.variants.map((v) => ({
          ...v,
          is_locked: false,
          glycemic_index: sanitizeGlycemicIndexFrontend(v.glycemic_index),
        }));
        setVariants(mappedVariants);
        setOriginalVariants(JSON.parse(JSON.stringify(mappedVariants))); // Deep copy for original values
        setVariantErrors(new Array(food.variants.length).fill(null)); // Initialize errors for existing variants
      } else {
        loadExistingVariants();
      }
    } else if (initialVariants && initialVariants.length > 0) {
      setFormData({
        name: "",
        brand: "",
        is_quick_food: false,
      });
      setVariants(initialVariants);
      setOriginalVariants(JSON.parse(JSON.stringify(initialVariants))); // Deep copy for original values
      setVariantErrors(new Array(initialVariants.length).fill(null)); // Initialize errors for initial variants
    } else {
      setFormData({
        name: "",
        brand: "",
        is_quick_food: false,
      });
      const defaultVariant: FoodVariant = {
        serving_size: 100,
        serving_unit: "g",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
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
        is_locked: false,
        glycemic_index: "None" as GlycemicIndex,
      };
                setVariants([defaultVariant]);
                setOriginalVariants([JSON.parse(JSON.stringify(defaultVariant))]); // Deep copy
                setVariantErrors([null]); // Initialize error for the single default variant
              }
            }, [food, initialVariants]);
          
            const loadExistingVariants = async () => {
              if (!food?.id || !isUUID(food.id)) return; // Ensure food.id is a valid UUID
          
              try {
                const data = await loadFoodVariants(food.id);
          
                let loadedVariants: FoodVariant[] = [];
                let defaultVariant: FoodVariant | undefined;
          
                if (data && data.length > 0) {
                  // Find the default variant
                  defaultVariant = data.find((v) => v.is_default);
          
                  // If no explicit default, try to use the one that matches the food's primary details
                  // This might be redundant if the backend always ensures one is_default=true
                  if (!defaultVariant && food.default_variant) {
                    defaultVariant = data.find((v) => v.id === food.default_variant?.id);
                  }
          
                  // If still no default, pick the first one or create a new one
                  if (!defaultVariant) {
                    defaultVariant = data[0];
                    if (defaultVariant) {
                      defaultVariant.is_default = true; // Mark it as default for the UI
                    }
                  }
          
                  if (defaultVariant) {
                    loadedVariants.push({ ...defaultVariant, is_locked: false }); // Initialize is_locked to false
                    loadedVariants = loadedVariants.concat(
                      data
                        .filter((v) => v.id !== defaultVariant?.id)
                        .map((v) => ({ ...v, is_locked: false }))
                    ); // Initialize is_locked to false
                  } else {
                    loadedVariants = data.map((v) => ({ ...v, is_locked: false })); // Fallback if no default is found, initialize is_locked to false
                  }
                } else {
                  // If no variants are returned, initialize with a single default variant
                  loadedVariants = [
                    {
                      serving_size: 100,
                      serving_unit: "g",
                      calories: 0, // kcal
                      protein: 0,
                      carbs: 0,
                      fat: 0,
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
                      is_locked: false, // Initialize as unlocked
                    },
                  ];
                }
                setVariants(loadedVariants);
                setOriginalVariants(JSON.parse(JSON.stringify(loadedVariants))); // Deep copy for original values
              } catch (error) {
                console.error("Error loading variants:", error);
                // Fallback to a single default variant on error
                const defaultVariant: FoodVariant = {
                  serving_size: 100,
                  serving_unit: "g",
                  calories: 0, // kcal
                  protein: 0,
                  carbs: 0,
                  fat: 0,
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
                  is_locked: false, // Initialize as unlocked
                  glycemic_index: sanitizeGlycemicIndexFrontend("None"),
                };
                setVariants([defaultVariant]);
                setOriginalVariants([JSON.parse(JSON.stringify(defaultVariant))]); // Deep copy for original values
              }
            };
          
            const addVariant = () => {
              const newVariant: FoodVariant = {
                serving_size: 1,
                serving_unit: "g",
                calories: 0, // kcal
                protein: 0,
                carbs: 0,
                fat: 0,
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
                is_default: false, // New variants are not default
                is_locked: false, // New variants are not locked
                glycemic_index: "None",
              };    setVariants((prevVariants) => [...prevVariants, newVariant]);
    setOriginalVariants((prevOriginal) => [...prevOriginal, JSON.parse(JSON.stringify(newVariant))]); // Add deep copy to original variants
    setVariantErrors((prevErrors) => [...prevErrors, null]); // Add a null error for the new variant
  };
 
  const duplicateVariant = (index: number) => {
    const variantToDuplicate = variants[index];
    const newVariant: FoodVariant = {
      ...variantToDuplicate,
      id: undefined, // New variant should not have an ID
      is_default: false, // New variant is not default
      is_locked: false, // New variant is not locked
      glycemic_index: variantToDuplicate.glycemic_index, // Duplicate GI as well
    };
    setVariants((prevVariants) => [...prevVariants, newVariant]);
    setOriginalVariants((prevOriginal) => [...prevOriginal, JSON.parse(JSON.stringify(newVariant))]); // Add deep copy to original variants
    setVariantErrors((prevErrors) => [...prevErrors, null]); // Add a null error for the duplicated variant
  };
 
  const removeVariant = (index: number) => {
    // Prevent removing the primary unit (index 0)
    if (index === 0) {
      toast({
        title: "Cannot remove default unit",
        description:
          "The default unit represents the food's primary serving and cannot be removed.",
        variant: "destructive",
      });
      return;
    }
    setVariants((prevVariants) => prevVariants.filter((_, i) => i !== index));
    setVariantErrors((prevErrors) => prevErrors.filter((_, i) => i !== index)); // Remove the error for the deleted variant
  };

  const updateVariant = (
    index: number,
    field: keyof FoodVariant,
    value: string | number | boolean | GlycemicIndex
  ) => {
    const updatedVariants = [...variants];
    const updatedOriginalVariants = [...originalVariants]; // Get a mutable copy of original variants
    const currentVariant = updatedVariants[index];
    let newVariant: FoodVariant = { ...currentVariant, [field]: value as any }; // Cast value to any to satisfy type

    const updatedErrors = [...variantErrors];

    // Validate serving_size
    if (field === "serving_size") {
      const numValue = Number(value);
      if (isNaN(numValue) || numValue <= 0) {
        updatedErrors[index] = "Serving size must be a positive number.";
      } else {
        updatedErrors[index] = ""; // Clear error if valid
      }
      setVariantErrors(updatedErrors);
    }
    
    // Convert calories input from display unit (energyUnit) to internal kcal
    if (field === "calories" && typeof value === 'number') {
      newVariant.calories = convertEnergy(value, energyUnit, 'kcal');
    }

    // If this variant is set to be the default, ensure all others are not
    if (field === "is_default" && value === true) {
      updatedVariants.forEach((v, i) => {
        if (i !== index) {
          v.is_default = false;
        }
      });
    }

    // Handle proportional scaling for locked variants when serving_size changes
    if (field === "serving_size" && newVariant.is_locked) {
      const originalVariant = updatedOriginalVariants[index]; // Use the corresponding original variant
      const originalServingSize = originalVariant.serving_size; // Use the stored original serving size
      const newServingSize = Number(value);

      if (originalServingSize > 0 && newServingSize >= 0) {
        const ratio = newServingSize / originalServingSize;
        newVariant.is_locked = true; // Ensure is_locked is true if scaling is applied

        const nutrientFields: NumericFoodVariantKeys[] = [
          "calories", // This will be in kcal
          "protein",
          "carbs",
          "fat",
          "saturated_fat",
          "polyunsaturated_fat",
          "monounsaturated_fat",
          "trans_fat",
          "cholesterol",
          "sodium",
          "potassium",
          "dietary_fiber",
          "sugars",
          "vitamin_a",
          "vitamin_c",
          "calcium",
          "iron",
        ];

        nutrientFields.forEach((nutrientField) => {
          const originalNutrientValue = originalVariant[nutrientField] as number;
          newVariant[nutrientField] = Number(
            (originalNutrientValue * ratio).toFixed(2)
          );
        });
      }
    } else if (nutrientFields.includes(field as NumericFoodVariantKeys)) {
     // If a nutrient field is manually edited, update its value in originalVariants as well
     // This ensures manual overrides are preserved as the new "original"
     const originalToUpdate = { ...updatedOriginalVariants[index] };
     (originalToUpdate[field as NumericFoodVariantKeys] as number) = newVariant[field as NumericFoodVariantKeys] as number; // Use the potentially converted newVariant value
     updatedOriginalVariants[index] = originalToUpdate;
     setOriginalVariants(updatedOriginalVariants);
   }

    updatedVariants[index] = newVariant;
    setVariants(updatedVariants);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Perform validation for all variants before submission
    const newVariantErrors: string[] = variants.map((variant) => {
      if (isNaN(variant.serving_size) || variant.serving_size <= 0) {
        return "Serving size must be a positive number.";
      }
      return "";
    });
    setVariantErrors(newVariantErrors);

    if (newVariantErrors.some((error) => error !== "")) {
      toast({
        title: "Validation Error",
        description: "Please correct the errors in the unit variants.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const defaultVariantCount = variants.filter((v) => v.is_default).length;
      if (defaultVariantCount === 0) {
        toast({
          title: "Validation Error",
          description:
            "At least one variant must be marked as the default unit.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      } else if (defaultVariantCount > 1) {
        toast({
          title: "Validation Error",
          description:
            "Only one variant can be marked as the default unit. Please correct this.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const primaryVariant = variants.find((v) => v.is_default);
      if (!primaryVariant) {
        toast({
          title: "Error",
          description: "No default variant found. This should not happen.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const foodData: Food = {
        id: food?.id || "",
        name: formData.name,
        brand: formData.brand,
        is_quick_food: formData.is_quick_food,
        is_custom: true,
      };

      const savedFood = await saveFood(foodData, variants, user.id, food?.id);

      toast({
        title: "Success",
        description: `Food ${
          food && food.id ? "updated" : "saved"
        } successfully with ${variants.length} unit variant(s)`,
      });

      if (food?.id && user?.id === food.user_id) {
        setSyncFoodId(savedFood.id);
        setShowSyncConfirmation(true);
      } else {
        if (!food || !food.id) {
          setFormData({
            name: "",
            brand: "",
            is_quick_food: false,
          });
          const defaultVariant: FoodVariant = {
            serving_size: 100,
            serving_unit: "g",
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
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
            is_locked: false,
            glycemic_index: sanitizeGlycemicIndexFrontend("None"),
          };
          setVariants([defaultVariant]);
          setOriginalVariants([JSON.parse(JSON.stringify(defaultVariant))]); // Deep copy
          setVariantErrors([null]);
        }
        onSave(savedFood);
      }

      if (!food || !food.id) {
        setFormData({
          name: "",
          brand: "",
          is_quick_food: false,
        });
        const defaultVariant: FoodVariant = {
          serving_size: 100,
          serving_unit: "g",
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
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
          is_locked: false,
          glycemic_index: sanitizeGlycemicIndexFrontend("None"),
        };
        setVariants([defaultVariant]);
        setOriginalVariants([JSON.parse(JSON.stringify(defaultVariant))]); // Deep copy
        setVariantErrors([null]);
      }

      onSave(savedFood);
    } catch (error) {
      console.error("Error saving food:", error);
      toast({
        title: "Error",
        description: `Failed to ${food && food.id ? "update" : "save"} food`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSyncConfirmation = async () => {
    if (syncFoodId) {
      try {
        await updateFoodEntriesSnapshot(syncFoodId);
        toast({
          title: "Success",
          description: "Past diary entries have been updated.",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to update past diary entries.",
          variant: "destructive",
        });
      }
    }
    setShowSyncConfirmation(false);
    onSave(food);
  };
 
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {food && food.id ? "Edit Food" : "Add Custom Food"}
          </CardTitle>
        </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info: grid-cols-1 on mobile, sm:grid-cols-2 on small screens and up */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Food Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => updateField("brand", e.target.value)}
              />
            </div>
          </div>

          {/* Quick Add Checkbox (already good, flex handles it) */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="is_quick_food"
              checked={formData.is_quick_food}
              onCheckedChange={(checked) =>
                updateField("is_quick_food", !!checked)
              }
            />
            <Label htmlFor="is_quick_food" className="text-sm font-medium">
              Quick Add (don't save to my food list for future use)
            </Label>
          </div>

          {/* Unit Variants with Individual Nutrition */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Unit Variants</h3>
              <Button type="button" onClick={addVariant} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Unit
              </Button>
            </div>
            <p className="text-sm text-gray-600">
              Add different unit measurements for this food with specific
              nutrition values for each unit.
            </p>

            <div className="space-y-6">
              {variants.map((variant, index) => (
                <Card key={index} className="p-4">
                  {/* Unit Variant Controls: Use flex-wrap and stack on small screens */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-wrap mb-4">
                    {/* Serving Size and Unit */}
                    <div className="flex items-end gap-2">
                      <div className="flex flex-col">
                        <Label htmlFor={`serving-size-${index}`}>Serving Size</Label>
                        <Input
                          id={`serving-size-${index}`}
                          type="number"
                          step="0.1"
                          value={variant.serving_size}
                          onChange={(e) =>
                            updateVariant(
                              index,
                              "serving_size",
                              Number(e.target.value)
                            )
                          }
                          className="w-24" // Fixed width for input
                        />
                      </div>
                      <div className="flex flex-col">
                        <Label htmlFor={`serving-unit-${index}`}>Unit Type</Label>
                        <Select
                          value={variant.serving_unit}
                          onValueChange={(value) =>
                            updateVariant(index, "serving_unit", value)
                          }
                        >
                          <SelectTrigger id={`serving-unit-${index}`} className="w-32">
                            {" "}
                            {/* Fixed width for select */}
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMON_UNITS.map((unit) => (
                              <SelectItem key={unit} value={unit}>
                                {unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {variantErrors[index] && (
                      <p className="text-red-500 text-sm mt-1">
                        {variantErrors[index]}
                      </p>
                    )}
 
                    {/* Default & Auto-Scale Checkboxes: wrap if needed */}
                    <div className="flex items-center gap-4 flex-wrap">
                      {" "}
                      {/* Adjusted gap and added flex-wrap */}
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`is-default-${index}`}
                          checked={variant.is_default || false}
                          onChange={(e) =>
                            updateVariant(index, "is_default", e.target.checked)
                          }
                          className="form-checkbox h-4 w-4 text-blue-600"
                        />
                        <Label
                          htmlFor={`is-default-${index}`}
                          className="text-sm"
                        >
                          Default
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`is-locked-${index}`}
                          checked={variant.is_locked || false}
                          onChange={(e) =>
                            updateVariant(index, "is_locked", e.target.checked)
                          }
                          className="form-checkbox h-4 w-4 text-blue-600"
                        />
                        <Label
                          htmlFor={`is-locked-${index}`}
                          className="text-sm"
                        >
                          Auto-Scale
                        </Label>
                      </div>
                    </div>
 
                    <div className="flex items-center gap-2 ml-auto sm:ml-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => duplicateVariant(index)}
                        title="Duplicate Unit"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      {index > 0 && ( // Only allow removing non-primary units
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeVariant(index)}
                          title="Remove Unit"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
 
                   {/* Nutrition for this specific variant */}
                   <div className="space-y-4">
                     <h4 className="text-md font-medium">
                       Nutrition per {variant.serving_size}{" "}
                       {variant.serving_unit}
                     </h4>
                     {/* Glycemic Index for this variant */}
                     <div className="mt-4">
                       <Label htmlFor={`glycemic_index-${index}`}>Glycemic Index (GI)</Label>
                       <Select
                         value={variant.glycemic_index || "None"}
                         onValueChange={(value: GlycemicIndex) => updateVariant(index, "glycemic_index", value)}
                       >
                         <SelectTrigger id={`glycemic_index-${index}`} className="w-[180px]">
                           <SelectValue placeholder="Select GI" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="None">None</SelectItem>
                           <SelectItem value="Very Low">Very Low</SelectItem>
                           <SelectItem value="Low">Low</SelectItem>
                           <SelectItem value="Medium">Medium</SelectItem>
                           <SelectItem value="High">High</SelectItem>
                           <SelectItem value="Very High">Very High</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
 
                    {/* Main Macros: Responsive Grid (1 col on mobile, 2 on sm, 3 on md, 4 on lg) */}
                    <div className="mt-4">
                      <h5 className="text-sm font-medium text-gray-700 mb-3">
                        Main Nutrients
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {visibleNutrients.includes("calories") && (
                          <div>
                            <Label>Calories ({getEnergyUnitString(energyUnit)})</Label>
                            <Input
                              type="number"
                              value={Math.round(convertEnergy(variant.calories, 'kcal', energyUnit))} // Display converted value
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "calories",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("protein") && (
                          <div>
                            <Label>Protein (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.protein}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "protein",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("carbs") && (
                          <div>
                            <Label>Carbs (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.carbs}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "carbs",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("fat") && (
                          <div>
                            <Label>Fat (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.fat}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "fat",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                      </div>
                    </div>
 
                    {/* Detailed Fat Information: Responsive Grid */}
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 mb-3">
                        Fat Breakdown
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {visibleNutrients.includes("saturated_fat") && (
                          <div>
                            <Label>Saturated Fat (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.saturated_fat}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "saturated_fat",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("polyunsaturated_fat") && (
                          <div>
                            <Label>Polyunsaturated Fat (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.polyunsaturated_fat}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "polyunsaturated_fat",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("monounsaturated_fat") && (
                          <div>
                            <Label>Monounsaturated Fat (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.monounsaturated_fat}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "monounsaturated_fat",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("trans_fat") && (
                          <div>
                            <Label>Trans Fat (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.trans_fat}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "trans_fat",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                      </div>
                    </div>
 
                    {/* Minerals and Other Nutrients: Responsive Grid */}
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 mb-3">
                        Minerals & Other
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {visibleNutrients.includes("cholesterol") && (
                          <div>
                            <Label>Cholesterol (mg)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.cholesterol}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "cholesterol",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("sodium") && (
                          <div>
                            <Label>Sodium (mg)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.sodium}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "sodium",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("potassium") && (
                          <div>
                            <Label>Potassium (mg)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.potassium}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "potassium",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("dietary_fiber") && (
                          <div>
                            <Label>Dietary Fiber (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.dietary_fiber}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "dietary_fiber",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                      </div>
                    </div>
 
                    {/* Sugars and Vitamins: Responsive Grid */}
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 mb-3">
                        Sugars & Vitamins
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {visibleNutrients.includes("sugars") && (
                          <div>
                            <Label>Sugars (g)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.sugars}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "sugars",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("vitamin_a") && (
                          <div>
                            <Label>Vitamin A (μg)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.vitamin_a}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "vitamin_a",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("vitamin_c") && (
                          <div>
                            <Label>Vitamin C (mg)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.vitamin_c}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "vitamin_c",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                        {visibleNutrients.includes("calcium") && (
                          <div>
                            <Label>Calcium (mg)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.calcium}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "calcium",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                      </div>
                    </div>
 
                    {/* Last row of nutrients: Responsive Grid */}
                    <div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {visibleNutrients.includes("iron") && (
                          <div>
                            <Label>Iron (mg)</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={variant.iron}
                              onChange={(e) =>
                                updateVariant(
                                  index,
                                  "iron",
                                  Number(e.target.value)
                                )
                              }
                              disabled={variant.is_locked}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? "Saving..."
              : food && food.id
              ? "Update Food"
              : "Add Food"}
          </Button>
        </form>
      </CardContent>
    </Card>
      {showSyncConfirmation && (
        <ConfirmationDialog
          open={showSyncConfirmation}
          onOpenChange={setShowSyncConfirmation}
          onConfirm={handleSyncConfirmation}
          title="Sync Past Entries?"
          description="Do you want to update all your past diary entries for this food with the new nutritional information?"
        />
      )}
    </>
  );
};

export default EnhancedCustomFoodForm;
