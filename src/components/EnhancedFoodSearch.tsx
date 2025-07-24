import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Search, Plus, Loader2, Edit, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import EnhancedCustomFoodForm from "./EnhancedCustomFoodForm";
import BarcodeScanner from "./BarcodeScanner";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { debug, error } from "@/utils/logging"; // Import logging functions
import {
  searchNutritionixFoods,
  getNutritionixNutrients,
  getNutritionixBrandedNutrients,
} from "@/services/NutritionixService";
import { getMeals } from "@/services/mealService"; // Import getMeals
import {
  searchFatSecretFoods,
  getFatSecretNutrients,
  FatSecretFoodItem,
} from "@/services/FatSecretService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { apiCall } from "@/services/api";
import { getProviderCategory } from "@/services/externalProviderService"; // New import
import { Food, FoodVariant } from "@/types/food";
import { Meal } from "@/types/meal"; // Import Meal type

interface OpenFoodFactsProduct {
  product_name: string;
  brands?: string;
  nutriments: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    "saturated-fat_100g"?: number;
    sodium_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
  };
  code: string;
}

interface EnhancedFoodSearchProps {
  onFoodSelect: (food: Food) => void;
  hideDatabaseTab?: boolean;
}

const EnhancedFoodSearch = ({
  onFoodSelect,
  hideDatabaseTab = false,
}: EnhancedFoodSearchProps) => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const {
    defaultFoodDataProviderId,
    setDefaultFoodDataProviderId,
    loggingLevel,
    itemDisplayLimit,
    nutrientDisplayPreferences,
  } = usePreferences(); // Get loggingLevel and itemDisplayLimit
  const isMobile = useIsMobile();
  const platform = isMobile ? "mobile" : "desktop";
  const [searchTerm, setSearchTerm] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]); // New state for meal results
  const [recentFoods, setRecentFoods] = useState<Food[]>([]); // New state for recent foods
  const [topFoods, setTopFoods] = useState<Food[]>([]); // New state for top foods
  const [openFoodFactsResults, setOpenFoodFactsResults] = useState<
    OpenFoodFactsProduct[]
  >([]);
  const [nutritionixResults, setNutritionixResults] = useState<any[]>([]); // To store Nutritionix search results
  const [fatSecretResults, setFatSecretResults] = useState<FatSecretFoodItem[]>(
    [],
  ); // To store FatSecret search results
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"database" | "online" | "barcode">(
    hideDatabaseTab ? "online" : "database",
  );
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<
    OpenFoodFactsProduct | Food | null
  >(null);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showAddFoodDialog, setShowAddFoodDialog] = useState(false); // New state for Add Food dialog
  const [foodDataProviders, setFoodDataProviders] = useState<any[]>([]); // To store configured food data providers
  const [selectedFoodDataProvider, setSelectedFoodDataProvider] = useState<
    string | null
  >(null); // To store the ID of the selected provider
  const [hasOnlineSearchBeenPerformed, setHasOnlineSearchBeenPerformed] =
    useState(false);

  // Load food data providers and set default
  useEffect(() => {
    const loadFoodDataProviders = async () => {
      const data = await apiCall(`/external-providers`);
      const error = null; // apiCall handles errors internally with toast, so we can assume data is valid if no error is thrown

      if (error) {
        console.error("Error loading food data providers:", error);
        toast({
          title: "Error",
          description: "Failed to load food data providers.",
          variant: "destructive",
        });
      } else {
        setFoodDataProviders(data || []);
        // Set default provider if available
        if (defaultFoodDataProviderId) {
          setSelectedFoodDataProvider(defaultFoodDataProviderId);
        } else if (data && data.length > 0) {
          // If no default is set, but providers exist, set the first one as selected
          setSelectedFoodDataProvider(data[0].id);
        }
      }
    };
    loadFoodDataProviders();
  }, [user, defaultFoodDataProviderId]);

  const searchDatabase = useCallback(
    async (term: string) => {
      setLoading(true);
      setFoods([]); // Clear previous search results
      setRecentFoods([]); // Clear previous recent foods
      setTopFoods([]); // Clear previous top foods

      try {
        if (!term.trim()) {
          // If search term is empty, fetch recent and top foods
          const data = await apiCall(`/foods?limit=${itemDisplayLimit}`);
          setRecentFoods(data.recentFoods || []);
          setTopFoods(data.topFoods || []);
        } else {
          // Otherwise, perform a regular search
          const data = await apiCall(
            `/foods?name=${encodeURIComponent(term)}&broadMatch=true`,
          );
          setFoods(data.searchResults || []);
        }
      } catch (err: any) {
        toast({
          title: "Search failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [itemDisplayLimit],
  ); // Add itemDisplayLimit to dependency array

  // Debounce effect for database search
  useEffect(() => {
    if (activeTab === "database") {
      const handler = setTimeout(() => {
        searchDatabase(searchTerm);
      }, 500); // 500ms debounce delay

      return () => {
        clearTimeout(handler);
      };
    }
  }, [searchTerm, activeTab, searchDatabase]);

  const searchOpenFoodFacts = async () => {
    if (!searchTerm.trim()) return;

    setLoading(true);
    try {
      const data = await apiCall(
        `/foods/openfoodfacts/search?query=${encodeURIComponent(searchTerm)}`,
      ); // This is for OpenFoodFacts search, remains the same

      if (data.products) {
        setOpenFoodFactsResults(
          data.products.filter(
            (p: any) =>
              p.product_name &&
              p.nutriments &&
              p.nutriments["energy-kcal_100g"],
          ),
        );
      }
    } catch (error: any) {
      toast({
        title: "OpenFoodFacts search failed",
        description: error.message || "Unable to search OpenFoodFacts database",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const searchOpenFoodFactsByBarcode = async (barcode: string) => {
    setLoading(true);
    try {
      const data = await apiCall(`/foods/openfoodfacts/barcode/${barcode}`); // This is for OpenFoodFacts barcode search, remains the same

      if (data.status === 1 && data.product) {
        setOpenFoodFactsResults([data.product]);
        setActiveTab("online"); // Switch to Online tab to display result
        toast({
          title: "Barcode scanned successfully",
          description: `Found product: ${data.product.product_name}`,
        });
      } else {
        setOpenFoodFactsResults([]);
        toast({
          title: "Product not found",
          description: "No product found for this barcode on OpenFoodFacts.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Barcode search failed",
        description: "Unable to search OpenFoodFacts database with barcode.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleOpenFoodFactsEdit = (product: OpenFoodFactsProduct) => {
    setEditingProduct(product);
    setShowEditDialog(true);
  };

  const convertOpenFoodFactsToFood = (product: OpenFoodFactsProduct): Food => {
    const defaultVariant: FoodVariant = {
      id: "default", // Assign a default ID for now
      serving_size: 100,
      serving_unit: "g",
      calories: Math.round(product.nutriments["energy-kcal_100g"] || 0),
      protein: Math.round((product.nutriments["proteins_100g"] || 0) * 10) / 10,
      carbs:
        Math.round((product.nutriments["carbohydrates_100g"] || 0) * 10) / 10,
      fat: Math.round((product.nutriments["fat_100g"] || 0) * 10) / 10,
      saturated_fat:
        Math.round((product.nutriments["saturated-fat_100g"] || 0) * 10) / 10,
      sodium: product.nutriments["sodium_100g"]
        ? Math.round(product.nutriments["sodium_100g"] * 1000)
        : 0,
      dietary_fiber:
        Math.round((product.nutriments["fiber_100g"] || 0) * 10) / 10,
      sugars: Math.round((product.nutriments["sugars_100g"] || 0) * 10) / 10,
      // Initialize other nutrients to 0 or appropriate defaults
      polyunsaturated_fat: 0,
      monounsaturated_fat: 0,
      trans_fat: 0,
      cholesterol: 0,
      potassium: 0,
      vitamin_a: 0,
      vitamin_c: 0,
      calcium: 0,
      iron: 0,
      is_default: true,
    };

    const convertedFood: Food = {
      id: undefined, // ID will be generated by the backend
      name: product.product_name,
      brand: product.brands?.split(",")[0]?.trim() || "",
      is_custom: false,
      provider_external_id: product.code,
      provider_type: "openfoodfacts",
      default_variant: defaultVariant,
      variants: [defaultVariant],
    };
    return convertedFood;
  };

  const handleSaveEditedFood = async (foodData: Food) => {
    // foodData is now the fully saved food from EnhancedCustomFoodForm
    try {
      onFoodSelect(foodData);

      // Close dialog and clear state
      setShowEditDialog(false);
      setEditingProduct(null);

      toast({
        title: "Food added",
        description: `${foodData.name} has been added and is ready to be added to your meal`,
      });
      window.dispatchEvent(new CustomEvent("foodDatabaseRefresh"));
    } catch (error) {
      console.error("Error handling edited food:", error);
      toast({
        title: "Error",
        description: "Failed to process the edited food",
        variant: "destructive",
      });
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    setFoods([]); // Clear previous results
    setMeals([]); // Clear previous meal results
    setOpenFoodFactsResults([]);
    setNutritionixResults([]);
    setFatSecretResults([]);

    if (!searchTerm.trim()) {
      setLoading(false);
      return;
    }

    if (activeTab === "database") {
      await searchDatabase(searchTerm); // Call with current searchTerm
      // Also search for meals in the database
      try {
        const fetchedMeals = await getMeals(activeUserId!, true); // Fetch public meals
        setMeals(
          fetchedMeals.filter((meal) =>
            meal.name.toLowerCase().includes(searchTerm.toLowerCase()),
          ),
        );
      } catch (err: any) {
        error(loggingLevel, "Error searching meals:", err);
      }
    } else if (activeTab === "online") {
      setHasOnlineSearchBeenPerformed(true); // Set to true when an online search is initiated
      if (!selectedFoodDataProvider) {
        toast({
          title: "Error",
          description: "Please select a food data provider from the dropdown.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const provider = foodDataProviders.find(
        (p) => p.id === selectedFoodDataProvider,
      );
      if (provider?.provider_type === "openfoodfacts") {
        await searchOpenFoodFacts();
      } else if (provider?.provider_type === "nutritionix") {
        const results = await searchNutritionixFoods(
          searchTerm,
          selectedFoodDataProvider,
        );
        setNutritionixResults(results);
      } else if (provider?.provider_type === "fatsecret") {
        const results = await searchFatSecretFoods(
          searchTerm,
          selectedFoodDataProvider,
        );
        setFatSecretResults(results);
      } else {
        toast({
          title: "Error",
          description: "Selected provider type is not supported for search.",
          variant: "destructive",
        });
      }
    }
    setLoading(false);
  };

  const convertNutritionixToFood = (item: any, nutrientData: any): Food => {
    const defaultVariant: FoodVariant = {
      id: "default", // Assign a default ID for now
      serving_size: nutrientData.serving_qty,
      serving_unit: nutrientData.serving_unit,
      calories: nutrientData.calories,
      protein: nutrientData.protein,
      carbs: nutrientData.carbohydrates,
      fat: nutrientData.fat,
      saturated_fat: nutrientData.saturated_fat,
      polyunsaturated_fat: nutrientData.polyunsaturated_fat || 0,
      monounsaturated_fat: nutrientData.monounsaturated_fat || 0,
      trans_fat: nutrientData.trans_fat || 0,
      cholesterol: nutrientData.cholesterol || 0,
      sodium: nutrientData.sodium,
      potassium: nutrientData.potassium || 0,
      dietary_fiber: nutrientData.dietary_fiber || 0,
      sugars: nutrientData.sugars || 0,
      vitamin_a: nutrientData.vitamin_a || 0,
      vitamin_c: nutrientData.vitamin_c || 0,
      calcium: nutrientData.calcium || 0,
      iron: nutrientData.iron || 0,
      is_default: true,
    };

    return {
      id: undefined, // ID will be generated by the backend
      name: nutrientData.food_name || nutrientData.name, // Use food_name for common foods, name for branded
      brand: nutrientData.brand_name || nutrientData.brand, // Use brand_name for common foods, brand for branded
      is_custom: false,
      provider_external_id: item.id,
      provider_type: "nutritionix",
      default_variant: defaultVariant,
      variants: [defaultVariant],
    };
  };

  const handleNutritionixEdit = async (item: any) => {
    setLoading(true);
    let nutrientData;
    if (item.id && item.id.startsWith("nix_")) {
      // It's a branded item, use nix_item_id to get full details
      nutrientData = await getNutritionixBrandedNutrients(
        item.id,
        selectedFoodDataProvider,
      );
    } else {
      // It's a common item, use natural language query
      nutrientData = await getNutritionixNutrients(
        item.name,
        selectedFoodDataProvider,
      );
    }
    setLoading(false);

    if (nutrientData) {
      setEditingProduct(convertNutritionixToFood(item, nutrientData)); // Convert to Food object for editing
      setShowEditDialog(true);
    } else {
      toast({
        title: "Error",
        description: "Failed to retrieve detailed nutrition for this item.",
        variant: "destructive",
      });
    }
  };

  const convertFatSecretToFood = (
    item: FatSecretFoodItem,
    nutrientData: any,
  ): Food => {
    const defaultVariant: FoodVariant = {
      id: "default", // Assign a default ID for now
      serving_size: nutrientData.serving_qty,
      serving_unit: nutrientData.serving_unit,
      calories: nutrientData.calories,
      protein: nutrientData.protein,
      carbs: nutrientData.carbohydrates,
      fat: nutrientData.fat,
      saturated_fat: nutrientData.saturated_fat,
      polyunsaturated_fat: nutrientData.polyunsaturated_fat || 0,
      monounsaturated_fat: nutrientData.monounsaturated_fat || 0,
      trans_fat: nutrientData.trans_fat || 0,
      cholesterol: nutrientData.cholesterol || 0,
      sodium: nutrientData.sodium,
      potassium: nutrientData.potassium || 0,
      dietary_fiber: nutrientData.dietary_fiber || 0,
      sugars: nutrientData.sugars || 0,
      vitamin_a: nutrientData.vitamin_a || 0,
      vitamin_c: nutrientData.vitamin_c || 0,
      calcium: nutrientData.calcium || 0,
      iron: nutrientData.iron || 0,
      is_default: true,
    };

    return {
      id: undefined, // ID will be generated by the backend
      name: nutrientData.name,
      brand: nutrientData.brand || item.brand_name || null, // Use detailed brand if available, else from search
      is_custom: false,
      provider_external_id: item.food_id, // Use food_id from FatSecretFoodItem
      provider_type: "fatsecret",
      default_variant: defaultVariant,
      variants: [defaultVariant],
    };
  };

  const handleFatSecretEdit = async (item: FatSecretFoodItem) => {
    setLoading(true);
    // Only fetch detailed nutrients when "Edit & Add" is clicked
    const nutrientData = await getFatSecretNutrients(
      item.food_id,
      selectedFoodDataProvider,
    );
    setLoading(false);

    if (nutrientData) {
      setEditingProduct(convertFatSecretToFood(item, nutrientData));
      setShowEditDialog(true);
    } else {
      toast({
        title: "Error",
        description: "Failed to retrieve detailed nutrition for this item.",
        variant: "destructive",
      });
    }
  };

  const foodSearchPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === "food_search" && p.platform === platform,
  );
  const visibleNutrients = foodSearchPreferences
    ? foodSearchPreferences.visible_nutrients
    : ["calories", "protein", "carbs", "fat"];

  const nutrientDetails: { [key: string]: { label: string; unit: string } } = {
    calories: { label: "cal", unit: "" },
    protein: { label: "protein", unit: "g" },
    carbs: { label: "carbs", unit: "g" },
    fat: { label: "fat", unit: "g" },
    dietary_fiber: { label: "fiber", unit: "g" },
    sugars: { label: "sugar", unit: "g" },
    sodium: { label: "sodium", unit: "mg" },
    cholesterol: { label: "cholesterol", unit: "mg" },
    saturated_fat: { label: "sat fat", unit: "g" },
    trans_fat: { label: "trans fat", unit: "g" },
    potassium: { label: "potassium", unit: "mg" },
    vitamin_a: { label: "vit a", unit: "mcg" },
    vitamin_c: { label: "vit c", unit: "mg" },
    iron: { label: "iron", unit: "mg" },
    calcium: { label: "calcium", unit: "mg" },
  };

  return (
    <div className="space-y-4">
      <div className="flex sm:flex-row flex-col gap-2 ">
        {!hideDatabaseTab && (
          <Button
            variant={activeTab === "database" ? "default" : "outline"}
            onClick={() => setActiveTab("database")}
          >
            Database
          </Button>
        )}
        <Button
          variant={activeTab === "online" ? "default" : "outline"}
          onClick={() => setActiveTab("online")}
        >
          Online
        </Button>
        <Button
          variant={activeTab === "barcode" ? "default" : "outline"}
          onClick={() => {
            setActiveTab("barcode");
            setShowBarcodeScanner(true);
          }}
        >
          <Camera className="w-4 h-4 mr-2" /> Scan Barcode
        </Button>
        <Button
          onClick={() => setShowAddFoodDialog(true)}
          className="whitespace-nowrap"
        >
          <Plus className="w-4 h-4 mr-2" /> Custom Food
        </Button>
      </div>

      <div className="flex space-x-2 items-center">
        <Input
          placeholder="Search for foods..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => {
            if (
              e.key === "Enter" &&
              (activeTab === "online" || activeTab === "barcode")
            ) {
              handleSearch();
            }
          }}
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </Button>
        {activeTab === "online" && (
          <Select
            value={selectedFoodDataProvider || ""}
            onValueChange={(value) => {
              setSelectedFoodDataProvider(value);
              // Optionally, save the new default provider preference
              setDefaultFoodDataProviderId(value);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Provider" />
            </SelectTrigger>
            <SelectContent>
              {foodDataProviders
                .filter(
                  (provider) =>
                    getProviderCategory(provider).includes("food") &&
                    provider.is_active,
                )
                .map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {" "}
                    {/* Use provider.id for value */}
                    {provider.provider_name} {/* Display provider name */}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {loading && (
          <div className="text-center py-8 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            Searching foods...
          </div>
        )}

        {!loading && activeTab === "database" && searchTerm.trim() === "" && (
          <>
            {recentFoods.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Recent Foods </h3>
                {recentFoods.map((food) => (
                  <Card
                    key={food.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => onFoodSelect(food)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex  items-center space-x-2 mb-2">
                            <h3 className="font-medium">{food.name}</h3>
                            {food.brand && (
                              <Badge variant="secondary" className="text-xs">
                                {food.brand}
                              </Badge>
                            )}
                            {food.is_custom && (
                              <Badge variant="outline" className="text-xs">
                                Custom
                              </Badge>
                            )}
                          </div>
                          <div
                            className={`grid grid-cols-1 sm:grid-cols-${visibleNutrients.length}  gap-2 text-sm   text-gray-600`}
                          >
                            {visibleNutrients.map((nutrient) => {
                              const details = nutrientDetails[nutrient];
                              if (!details) return null;
                              const value =
                                (food.default_variant?.[
                                  nutrient as keyof FoodVariant
                                ] as number) || 0;
                              return (
                                <span key={nutrient}>
                                  <strong>
                                    {value.toFixed(
                                      nutrient === "calories" ? 0 : 1,
                                    )}
                                    {details.unit}
                                  </strong>{" "}
                                  {details.label}
                                </span>
                              );
                            })}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Per {food.default_variant?.serving_size}
                            {food.default_variant?.serving_unit}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {topFoods.length > 0 && (
              <div className="space-y-2 mt-4">
                <h3 className="text-lg font-semibold">Top Foods</h3>
                {topFoods.map((food) => (
                  <Card
                    key={food.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                    onClick={() => onFoodSelect(food)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h3 className="font-medium">{food.name}</h3>
                            {food.brand && (
                              <Badge variant="secondary" className="text-xs">
                                {food.brand}
                              </Badge>
                            )}
                            {food.is_custom && (
                              <Badge variant="outline" className="text-xs">
                                Custom
                              </Badge>
                            )}
                          </div>
                          <div
                            className={`grid grid-cols-1 sm:grid-cols-${visibleNutrients.length} gap-2 text-sm text-gray-600`}
                          >
                            {visibleNutrients.map((nutrient) => {
                              const details = nutrientDetails[nutrient];
                              if (!details) return null;
                              const value =
                                (food.default_variant?.[
                                  nutrient as keyof FoodVariant
                                ] as number) || 0;
                              return (
                                <span key={nutrient}>
                                  <strong>
                                    {value.toFixed(
                                      nutrient === "calories" ? 0 : 1,
                                    )}
                                    {details.unit}
                                  </strong>{" "}
                                  {details.label}
                                </span>
                              );
                            })}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Per {food.default_variant?.serving_size}
                            {food.default_variant?.serving_unit}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {recentFoods.length === 0 && topFoods.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No recent or top foods found. Start logging foods to see them
                here.
              </div>
            )}
          </>
        )}

        {!loading &&
          activeTab === "database" &&
          searchTerm.trim() !== "" &&
          foods.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No foods found in your database for "{searchTerm}".
            </div>
          )}

        {!loading &&
          activeTab === "online" &&
          !hasOnlineSearchBeenPerformed && (
            <div className="text-center py-8 text-gray-500">
              Click the search icon to search online.
            </div>
          )}

        {!loading &&
          activeTab === "online" &&
          hasOnlineSearchBeenPerformed &&
          openFoodFactsResults.length === 0 &&
          nutritionixResults.length === 0 &&
          fatSecretResults.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No foods found from the selected online provider.
            </div>
          )}

        {activeTab === "database" &&
          searchTerm.trim() !== "" &&
          meals.map((meal) => (
            <Card
              key={meal.id}
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              onClick={() => onFoodSelect(meal as any)}
            >
              {" "}
              {/* Cast to any for now, will refine */}
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium">{meal.name}</h3>
                      {meal.is_public && (
                        <Badge variant="outline" className="text-xs">
                          Public Meal
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {meal.description || "No description available."}
                    </p>
                    {/* You might want to display total nutrition for the meal here */}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

        {activeTab === "database" &&
          searchTerm.trim() !== "" &&
          foods.map((food) => (
            <Card
              key={food.id}
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              onClick={() => onFoodSelect(food)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium">{food.name}</h3>
                      {food.brand && (
                        <Badge variant="secondary" className="text-xs">
                          {food.brand}
                        </Badge>
                      )}
                      {food.is_custom && (
                        <Badge variant="outline" className="text-xs">
                          Custom
                        </Badge>
                      )}
                    </div>
                    <div
                      className={`grid grid-cols-${visibleNutrients.length} gap-2 text-sm text-gray-600`}
                    >
                      {visibleNutrients.map((nutrient) => {
                        const details = nutrientDetails[nutrient];
                        if (!details) return null;
                        const value =
                          (food.default_variant?.[
                            nutrient as keyof FoodVariant
                          ] as number) || 0;
                        return (
                          <span key={nutrient}>
                            <strong>
                              {value.toFixed(nutrient === "calories" ? 0 : 1)}
                              {details.unit}
                            </strong>{" "}
                            {details.label}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Per {food.default_variant?.serving_size}
                      {food.default_variant?.serving_unit}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

        {activeTab === "online" &&
          openFoodFactsResults.length > 0 &&
          openFoodFactsResults.map((product) => (
            <Card
              key={product.code}
              className="hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium">{product.product_name}</h3>
                      {product.brands && (
                        <Badge variant="secondary" className="text-xs">
                          {product.brands.split(",")[0]}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        OpenFoodFacts
                      </Badge>
                    </div>
                    <div
                      className={`grid grid-cols-${visibleNutrients.length} gap-2 text-sm text-gray-600`}
                    >
                      {visibleNutrients.map((nutrient) => {
                        const details = nutrientDetails[nutrient];
                        if (!details) return null;
                        let value = 0;
                        switch (nutrient) {
                          case "calories":
                            value = product.nutriments["energy-kcal_100g"] || 0;
                            break;
                          case "protein":
                            value = product.nutriments["proteins_100g"] || 0;
                            break;
                          case "carbs":
                            value =
                              product.nutriments["carbohydrates_100g"] || 0;
                            break;
                          case "fat":
                            value = product.nutriments["fat_100g"] || 0;
                            break;
                          case "dietary_fiber":
                            value = product.nutriments["fiber_100g"] || 0;
                            break;
                        }
                        return (
                          <span key={nutrient}>
                            <strong>{Math.round(value)}</strong> {details.label}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Per 100g</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleOpenFoodFactsEdit(product)}
                    className="ml-2"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit & Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

        {activeTab === "online" &&
          nutritionixResults.length > 0 &&
          nutritionixResults.map((item) => (
            <Card
              key={item.id}
              className="hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium">{item.name}</h3>
                      {item.brand && (
                        <Badge variant="secondary" className="text-xs">
                          {item.brand}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        Nutritionix
                      </Badge>
                    </div>
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-16 h-16 object-cover rounded-md mr-4"
                      />
                    )}
                    {item.calories && (
                      <div
                        className={`grid grid-cols-${visibleNutrients.length} gap-2 text-sm text-gray-600 mt-1`}
                      >
                        {visibleNutrients.map((nutrient) => {
                          const details = nutrientDetails[nutrient];
                          if (!details || !item[nutrient]) return null;
                          return (
                            <span key={nutrient}>
                              <strong>
                                {Math.round(item[nutrient])}
                                {details.unit}
                              </strong>{" "}
                              {details.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {item.serving_size && item.serving_unit && (
                      <p className="text-xs text-gray-500 mt-1">
                        Per {item.serving_size}
                        {item.serving_unit}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleNutritionixEdit(item)}
                    className="ml-2"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit & Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

        {activeTab === "online" &&
          fatSecretResults.length > 0 &&
          fatSecretResults.map((item) => (
            <Card
              key={item.food_id}
              className="hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium">{item.food_name}</h3>
                      {item.brand_name && (
                        <Badge variant="secondary" className="text-xs">
                          {item.brand_name}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        FatSecret
                      </Badge>
                    </div>
                    {item.calories !== undefined &&
                      item.protein !== undefined &&
                      item.carbs !== undefined &&
                      item.fat !== undefined && (
                        <div
                          className={`grid grid-cols-${visibleNutrients.length} gap-2 text-sm text-gray-600 mt-1`}
                        >
                          {visibleNutrients.map((nutrient) => {
                            const details = nutrientDetails[nutrient];
                            if (!details || item[nutrient] === undefined)
                              return null;
                            return (
                              <span key={nutrient}>
                                <strong>
                                  {Math.round(item[nutrient])}
                                  {details.unit}
                                </strong>{" "}
                                {details.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    {item.serving_size && item.serving_unit && (
                      <p className="text-xs text-gray-500 mt-1">
                        Per {item.serving_size}
                        {item.serving_unit}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleFatSecretEdit(item)}
                    className="ml-2"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit & Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Edit Dialog for OpenFoodFacts products */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Food Details</DialogTitle>
            <DialogDescription>
              Adjust the food details before adding it to your custom database.
            </DialogDescription>
          </DialogHeader>
          {editingProduct && (
            <EnhancedCustomFoodForm
              food={
                editingProduct && "product_name" in editingProduct
                  ? convertOpenFoodFactsToFood(
                      editingProduct as OpenFoodFactsProduct,
                    )
                  : (editingProduct as Food)
              }
              initialVariants={(editingProduct as Food).variants} // Pass the variants array
              onSave={handleSaveEditedFood}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add New Food Dialog */}
      <Dialog open={showAddFoodDialog} onOpenChange={setShowAddFoodDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Food</DialogTitle>
            <DialogDescription>
              Enter the details for a new food item to add to your database.
            </DialogDescription>
          </DialogHeader>
          <EnhancedCustomFoodForm onSave={handleSaveEditedFood} />
        </DialogContent>
      </Dialog>

      {/* Barcode Scanner Dialog */}
      <Dialog open={showBarcodeScanner} onOpenChange={setShowBarcodeScanner}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
            <DialogDescription>
              Position the product barcode in front of your camera.
            </DialogDescription>
          </DialogHeader>
          <BarcodeScanner
            onBarcodeDetected={(barcode) => {
              searchOpenFoodFactsByBarcode(barcode);
              setShowBarcodeScanner(false);
            }}
            onClose={() => setShowBarcodeScanner(false)}
            isActive={showBarcodeScanner}
            cameraFacing="back"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnhancedFoodSearch;
