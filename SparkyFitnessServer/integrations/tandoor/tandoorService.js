const { log } = require('../../config/logging');
// Using native fetch (standard in Node 22+)

class TandoorService {
    constructor(baseUrl, apiKey) {
        if (!baseUrl) {
            throw new Error('Tandoor baseUrl not provided.');
        }
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            this.baseUrl = `https://${baseUrl}`;
        } else {
            this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        }
        this.accessToken = apiKey; // Tandoor API uses token for authentication
    }

    // Placeholder for searchRecipes
    async searchRecipes(query, options = {}) {
        if (!this.accessToken) {
            throw new Error('Tandoor API key not provided.');
        }

        const url = new URL(`${this.baseUrl}/api/recipe/`);
        url.searchParams.append('query', query);
        url.searchParams.append('page_size', 10); // Limit results to 10

        try {
            const authHeader = (typeof this.accessToken === 'string' && (this.accessToken.startsWith('Bearer ') || this.accessToken.startsWith('Token ')))
                ? this.accessToken
                : `Bearer ${this.accessToken}`;

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            });
            log('debug', `Tandoor search HTTP status: ${response.status} ${response.statusText}`);
            const contentType = response.headers.get('content-type') || '';
            log('debug', `Tandoor search response content-type: ${contentType}`);

            if (!response.ok) {
                const errorText = await response.text();
                log('error', `Tandoor API Error Response (Raw): ${errorText}`);
                try {
                    const errorData = JSON.parse(errorText);
                    throw new Error(`Search failed: ${response.status} ${response.statusText} - ${errorData.detail}`);
                } catch (jsonError) {
                    throw new Error(`Search failed: ${response.status} ${response.statusText} - ${errorText}`);
                }
            }

            // If the server returned HTML (browsable API or login page), log the raw text for diagnosis
            if (!contentType.includes('application/json')) {
                const raw = await response.text();
                log('error', `Tandoor search returned non-JSON response. Raw body: ${raw.substring(0, 2000)}`);
                return [];
            }

            const data = await response.json();
            // Log the top-level keys / type to help debugging different API shapes
            try {
                const topType = Array.isArray(data) ? 'array' : typeof data;
                const keys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [];
                log('debug', `Tandoor search response type: ${topType}, keys: ${JSON.stringify(keys)}`);
            } catch (e) {
                log('debug', 'Tandoor search response could not be inspected');
            }

            // Support multiple response shapes:
            // - paginated: { results: [...] }
            // - direct array: [ {...}, ... ]
            // - possible alternate keys: { recipes: [...] }
            let results = [];
            if (Array.isArray(data)) {
                results = data;
            } else if (data && Array.isArray(data.results)) {
                results = data.results;
            } else if (data && Array.isArray(data.recipes)) {
                results = data.recipes;
            } else if (data && Array.isArray(data.objects)) {
                results = data.objects;
            } else {
                // As a last resort, try to find the first array-valued property
                if (data && typeof data === 'object') {
                    for (const k of Object.keys(data)) {
                        if (Array.isArray(data[k])) {
                            results = data[k];
                            break;
                        }
                    }
                }
            }

            log('debug', `Found ${results.length} recipes for query: ${query}`);
            return results;
        } catch (error) {
            log('error', 'Error during Tandoor recipe search:', error.message);
            return [];
        }
    }

    async getRecipeDetails(id, options = {}) {
        if (!this.accessToken) {
            throw new Error('Tandoor API key not provided.');
        }

        const url = `${this.baseUrl}/api/recipe/${id}/`;

        try {
            const authHeader = (typeof this.accessToken === 'string' && (this.accessToken.startsWith('Bearer ') || this.accessToken.startsWith('Token ')))
                ? this.accessToken
                : `Bearer ${this.accessToken}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                    ...options.headers,
                },
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Get recipe details failed: ${response.status} ${response.statusText} - ${errorData}`);
            }

            const data = await response.json();
            log('debug', `Successfully retrieved details for recipe: ${id}`);
            return data;
        } catch (error) {
            log('error', 'Error during Tandoor recipe details retrieval:', error.message);
            return null;
        }
    }

    mapTandoorRecipeToSparkyFood(tandoorRecipe, userId) {
        log('debug', `[Tandoor Mapping] Starting mapping for recipe ID: ${tandoorRecipe.id} ("${tandoorRecipe.name}")`);

        const extractFromProperties = (props, candidates) => {
            if (!Array.isArray(props)) return null;

            for (const cand of candidates) {
                const candNorm = cand.toLowerCase().replace(/[^a-z0-9]/g, '');

                const found = props.find(p => {
                    const pt = p.property_type;
                    if (!pt) return false;

                    const nameNorm = (pt.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const slugNorm = (pt.open_data_slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                    // Match against name OR the slug (e.g., "property-calories" matches "calories")
                    return nameNorm === candNorm || slugNorm.includes(candNorm);
                });

                if (found && found.property_amount !== undefined && found.property_amount !== null) {
                    const num = Number(found.property_amount);
                    if (!Number.isNaN(num)) {
                        log('debug', `[Tandoor Mapping] Found property match: ${cand} = ${num}`);
                        return num;
                    }
                }
            }
            return null;
        };

        const properties = tandoorRecipe.properties || [];

        // Prefer explicit nutrition object if present, otherwise fall back to properties
        const nutrition = tandoorRecipe.nutrition || {};

        // Generic getter that checks multiple candidate names across nutrition object keys and properties
        const getNutritionValue = (candidates, label) => {
            if (Array.isArray(tandoorRecipe.nutrition)) {
                for (const item of tandoorRecipe.nutrition) {
                    if (item.name && item.value !== undefined) {
                        const keyNorm = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        for (const c of candidates) {
                            const candNorm = c.toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (keyNorm === candNorm) {
                                const num = Number(item.value);
                                if (!Number.isNaN(num)) {
                                    log('debug', `[Tandoor Mapping] Nutrition Match: Found "${label}" via Tandoor key "${item.name}" = ${num}`);
                                    return num;
                                }
                            }
                        }
                    }
                }
            }

            const fallbackVal = extractFromProperties(properties, candidates);
            if (fallbackVal !== null) {
                return fallbackVal;
            }

            log('debug', `[Tandoor Mapping] No Match: Could not find value for "${label}" (Candidates: ${candidates.join(', ')})`);
            return null;
        };

        // Candidate name lists for common nutrients (covering common variants/case)
        const nutrientsMap = {
            calories: ['calories', 'cal', 'kcal', 'energy', 'kcalories', 'property-calories', 'property-energy'],
            protein: ['protein', 'proteins', 'protein_g', 'proteins_g', 'property-proteins'],
            carbs: ['carbohydrates', 'carbohydrate', 'carbs', 'carb', 'property-carbohydrates'],
            fat: ['fat', 'fats', 'totalfat', 'total_fat', 'total fat', 'property-fats'],
            saturated_fat: ['saturated fat', 'saturated_fat', 'saturatedfat', 'sat fat', 'sat_fat', 'property-fatty-acids-total-saturated'],
            polyunsaturated_fat: ['polyunsaturated fat', 'polyunsaturated_fat', 'polyunsaturatedfat', 'pufa', 'property-fatty-acids-total-polyunsaturated'],
            monounsaturated_fat: ['monounsaturated fat', 'monounsaturated_fat', 'monounsaturatedfat', 'mufa', 'property-fatty-acids-total-monounsaturated'],
            trans_fat: ['trans fat', 'trans_fat', 'transfat', 'property-fatty-acids-total-trans'],
            cholesterol: ['cholesterol', 'property-cholesterol'],
            sodium: ['sodium', 'na', 'salt (na)', 'property-sodium'],
            potassium: ['potassium', 'k', 'property-potassium-k'],
            dietary_fiber: ['fiber', 'dietary fiber', 'dietary_fiber', 'fibre', 'property-fiber'],
            sugars: ['sugars', 'sugar', 'property-sugar'],
            vitamin_a: ['vitamin a', 'vit a', 'vitamin_a', 'vitamina', 'property-vitamin-a-rae'],
            vitamin_c: ['vitamin c', 'vit c', 'vitamin_c', 'vitaminc', 'property-vitamin-c-total-ascorbic-acid'],
            calcium: ['calcium', 'ca', 'property-calcium-ca'],
            iron: ['iron', 'fe', 'property-iron-fe']
        };

        const calories = getNutritionValue(nutrientsMap.calories);
        const protein = getNutritionValue(nutrientsMap.protein);
        const carbs = getNutritionValue(nutrientsMap.carbs);
        const fat = getNutritionValue(nutrientsMap.fat);
        const saturated_fat = getNutritionValue(nutrientsMap.saturated_fat);
        const polyunsaturated_fat = getNutritionValue(nutrientsMap.polyunsaturated_fat);
        const monounsaturated_fat = getNutritionValue(nutrientsMap.monounsaturated_fat);
        const trans_fat = getNutritionValue(nutrientsMap.trans_fat);
        const cholesterol = getNutritionValue(nutrientsMap.cholesterol);
        const sodium = getNutritionValue(nutrientsMap.sodium);
        const potassium = getNutritionValue(nutrientsMap.potassium);
        const dietary_fiber = getNutritionValue(nutrientsMap.dietary_fiber);
        const sugars = getNutritionValue(nutrientsMap.sugars);
        const vitamin_a = getNutritionValue(nutrientsMap.vitamin_a);
        const vitamin_c = getNutritionValue(nutrientsMap.vitamin_c);
        const calcium = getNutritionValue(nutrientsMap.calcium);
        const iron = getNutritionValue(nutrientsMap.iron);

        if ((!nutrition || Object.keys(nutrition).length === 0) && properties && properties.length) {
            log('debug', `Derived nutrition from properties for recipe ${tandoorRecipe.id}: calories=${calories}, protein=${protein}, carbs=${carbs}, fat=${fat}`);
        }

        // Default serving information: preserve recipe servings count when provided (numeric)
        let recipeYield = 1;
        if (tandoorRecipe.servings && !Number.isNaN(Number(tandoorRecipe.servings))) {
            recipeYield = Number(tandoorRecipe.servings);
        } else if (Array.isArray(tandoorRecipe.servings_text) && tandoorRecipe.servings_text.length && !Number.isNaN(Number(tandoorRecipe.servings_text[0]))) {
            recipeYield = Number(tandoorRecipe.servings_text[0]);
        }

        log('debug', `[Tandoor Mapping] Recipe makes ${recipeYield} servings. Data is per-serving.`);

        return {
            food: {
                name: tandoorRecipe.name,
                // Tandoor doesn't seem to have a direct 'brand' equivalent for recipes,
                // so we can leave it null or derive from source_url if appropriate.
                brand: tandoorRecipe.source_url ? new URL(tandoorRecipe.source_url).hostname : null,
                is_custom: true, // Assuming recipes from Tandoor are custom to the user's instance
                user_id: userId,
                shared_with_public: false, // Default to private, can be changed later
                provider_external_id: tandoorRecipe.id.toString(), // Use Tandoor's ID as external ID
                provider_type: 'tandoor',
                is_quick_food: false,
            },
            variant: {
                // Tandoor nutrition values are alway for 1 serving
                serving_size: 1,
                serving_unit: 'serving',
                // Map nutrition values (fallbacks may be null -> coerce to 0)
                calories: Number(calories) || 0,
                protein: Number(protein) || 0,
                carbs: Number(carbs) || 0,
                fat: Number(fat) || 0,
                // Tandoor API response in API.txt does not provide granular fat details,
                // nor vitamins and minerals like calcium, iron, vitamin a, vitamin c, potassium.
                // Setting them to 0 or finding a way to calculate/derive them if possible.
                saturated_fat: Number(saturated_fat) || 0,
                polyunsaturated_fat: Number(polyunsaturated_fat) || 0,
                monounsaturated_fat: Number(monounsaturated_fat) || 0,
                trans_fat: Number(trans_fat) || 0,
                cholesterol: Number(cholesterol) || 0,
                sodium: Number(sodium) || 0,
                potassium: Number(potassium) || 0,
                dietary_fiber: Number(dietary_fiber) || 0,
                sugars: Number(sugars) || 0,
                vitamin_a: Number(vitamin_a) || 0,
                vitamin_c: Number(vitamin_c) || 0,
                calcium: Number(calcium) || 0,
                iron: Number(iron) || 0,
                is_default: true,
            }
        };
    }
}

module.exports = TandoorService;