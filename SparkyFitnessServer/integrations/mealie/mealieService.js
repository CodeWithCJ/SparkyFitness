const { log } = require('../../config/logging');
// Using native fetch (standard in Node 22+)

class MealieService {
    constructor(baseUrl, apiKey) {
        if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            this.baseUrl = `https://${baseUrl}`;
        } else {
            this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        }
        this.accessToken = apiKey; // Directly use the provided API key as the access token
    }

    async searchRecipes(query, options = {}) {
        if (!this.accessToken) {
            throw new Error('Mealie API key not provided.');
        }

        const url = new URL(`${this.baseUrl}/api/recipes`);
        url.searchParams.append('queryFilter', `name LIKE "%${query}%"`); // Use queryFilter for better filtering
        url.searchParams.append('perPage', 10); // Limit results to 10 using perPage
        url.searchParams.append('page', 1); // Request the first page of results

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json',
                    ...options.headers, // Apply custom headers
                },
            });

            if (!response.ok) {
                const errorText = await response.text(); // Read response as text
                log('error', `Mealie API Error Response (Raw): ${errorText}`); // Log the raw response
                try {
                    const errorData = JSON.parse(errorText); // Attempt to parse as JSON
                    throw new Error(`Search failed: ${response.status} ${response.statusText} - ${errorData.detail}`);
                } catch (jsonError) {
                    // If parsing fails, use the raw text as the error message
                    throw new Error(`Search failed: ${response.status} ${response.statusText} - ${errorText}`);
                }
            }

            const data = await response.json();
            log('debug', `Found ${data.items.length} recipes for query: ${query}`);
            return data.items; // Assuming 'items' contains the list of recipes
        } catch (error) {
            log('error', 'Error during Mealie recipe search:', error.message);
            return [];
        }
    }

    async getRecipeDetails(slug, options = {}) { // Added options parameter
        if (!this.accessToken) {
            throw new Error('Mealie API key not provided.');
        }

        const url = `${this.baseUrl}/api/recipes/${slug}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json',
                    ...options.headers, // Apply custom headers
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Get recipe details failed: ${response.status} ${response.statusText} - ${errorData.detail}`);
            }

            const data = await response.json();
            log('debug', `Successfully retrieved details for recipe: ${slug}`);
            return data;
        } catch (error) {
            log('error', 'Error during Mealie recipe details retrieval:', error.message);
            return null;
        }
    }
    mapMealieRecipeToSparkyFood(mealieRecipe, userId) {
        log('debug', 'Raw Mealie Recipe Data:', JSON.stringify(mealieRecipe, null, 2));
        const nutrition = mealieRecipe.nutrition || {};
        const defaultServing = mealieRecipe.recipeServings || 1;
        const servingUnit = mealieRecipe.recipeYield || 'serving';

        return {
            food: {
                name: mealieRecipe.name,
                brand: mealieRecipe.orgURL ? new URL(mealieRecipe.orgURL).hostname : null,
                is_custom: true, // Assuming recipes from Mealie are custom to the user's instance
                user_id: userId,
                shared_with_public: false, // Default to private, can be changed later
                provider_external_id: mealieRecipe.slug, // Use Mealie's slug as external ID
                provider_type: 'mealie',
                is_quick_food: false,
            },
            variant: {
                serving_size: defaultServing,
                serving_unit: servingUnit,
                calories: parseFloat(nutrition?.calories) || 0,
                protein: parseFloat(nutrition?.proteinContent) || 0,
                carbs: parseFloat(nutrition?.carbohydrateContent) || 0,
                fat: parseFloat(nutrition?.fatContent) || 0,
                saturated_fat: parseFloat(nutrition?.saturatedFatContent) || 0,
                polyunsaturated_fat: parseFloat(nutrition?.unsaturatedFatContent) || 0,
                monounsaturated_fat: 0, // Mealie doesn't explicitly provide this
                trans_fat: parseFloat(nutrition?.transFatContent) || 0,
                cholesterol: parseFloat(nutrition?.cholesterolContent) || 0,
                sodium: parseFloat(nutrition?.sodiumContent) || 0,
                potassium: 0, // Mealie doesn't explicitly provide this
                dietary_fiber: parseFloat(nutrition?.fiberContent) || 0,
                sugars: parseFloat(nutrition?.sugarContent) || 0,
                vitamin_a: 0, // Mealie doesn't explicitly provide this
                vitamin_c: 0, // Mealie doesn't explicitly provide this
                calcium: 0, // Mealie doesn't explicitly provide this
                iron: 0, // Mealie doesn't explicitly provide this
                is_default: true,
            }
        };
    }
}

module.exports = MealieService;