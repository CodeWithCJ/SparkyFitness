const { log } = require('../../config/logging');
let fetch;
import('node-fetch').then(module => {
    fetch = module.default;
});

class TandoorService {
    constructor(baseUrl, apiKey) {
        if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
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

        const url = new URL(`${this.baseUrl}/api/recipe`);
        url.searchParams.append('query', query);
        url.searchParams.append('page_size', 10); // Limit results to 10

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Token ${this.accessToken}`, // Tandoor uses Token authentication
                    'Accept': 'application/json',
                    ...options.headers,
                },
            });

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

            const data = await response.json();
            const results = Array.isArray(data.results) ? data.results : [];
            log('debug', `Found ${results.length} recipes for query: ${query}`);
            return results; // Assuming 'results' contains the list of recipes
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
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Token ${this.accessToken}`,
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
        log('debug', 'Raw Tandoor Recipe Data:', JSON.stringify(tandoorRecipe, null, 2));
        const nutrition = tandoorRecipe.nutrition || {}; // Assuming nutrition is directly available or needs parsing from properties
        
        // Default serving information if not explicitly available
        // Tandoor API provides servings as a direct field, 'servings'
        const defaultServing = tandoorRecipe.servings || 1;
        // Tandoor API provides servings_text as a direct field, 'servings_text'
        const servingUnit = tandoorRecipe.servings_text || 'serving';

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
                serving_size: defaultServing,
                serving_unit: servingUnit,
                // Directly mapping nutrition fields from Tandoor's recipe object
                calories: parseFloat(nutrition.calories) || 0,
                protein: parseFloat(nutrition.proteins) || 0,
                carbs: parseFloat(nutrition.carbohydrates) || 0,
                fat: parseFloat(nutrition.fats) || 0,
                // Tandoor API response in API.txt does not provide granular fat details,
                // nor vitamins and minerals like calcium, iron, vitamin a, vitamin c, potassium.
                // Setting them to 0 or finding a way to calculate/derive them if possible.
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
            }
        };
    }
}

module.exports = TandoorService;