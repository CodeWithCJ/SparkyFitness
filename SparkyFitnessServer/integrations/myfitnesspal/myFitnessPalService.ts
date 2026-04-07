import axios from 'axios';
import { log } from '../../config/logging';
import { getExternalDataProviderByUserIdAndProviderName } from '../../models/externalProviderRepository';

/** Maximum concurrent DELETE requests during idempotency cleanup */
const DELETE_CONCURRENCY = 5;

interface MFPProvider {
  app_id: string;
  app_key: string;
}

export interface MFPCategoryData {
  calories: number;
  protein: number;
  fat: number;
  carbohydrate: number;
}

export interface MFPNutritionData {
  date: string; // YYYY-MM-DD
  categories: { [key: string]: MFPCategoryData };
}

/**
 * Pushes nutrition data to MyFitnessPal directly via HTTP.
 * Mimics the logic previously held in the Garmin microservice, but enhanced for multiple categories.
 */
export async function pushNutritionToMFP(
  userId: string,
  data: MFPNutritionData
) {
  try {
    // 1. Get MFP credentials from external providers
    const mfpProvider = (await getExternalDataProviderByUserIdAndProviderName(
      userId,
      'myfitnesspal'
    )) as MFPProvider | null;

    if (!mfpProvider || !mfpProvider.app_key) {
      log(
        'info',
        `pushNutritionToMFP: No MyFitnessPal provider or cookies found for user ${userId}. Skipping MFP sync.`
      );
      return null;
    }

    const cookiesStr = mfpProvider.app_key;
    const initialCsrfToken = mfpProvider.app_id || '';

    // Cookie Helper: Parse initial cookies and manage session
    let currentCookies = cookiesStr;

    const baseHeaders = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'ru,uk;q=0.9,en-US;q=0.8,en;q=0.7',
      'content-type': 'application/json',
      origin: 'https://www.myfitnesspal.com',
      referer: 'https://www.myfitnesspal.com/ru/food/diary',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'x-requested-with': 'XMLHttpRequest',
    };

    // Step 1: Fetch fresh CSRF Token & Update Cookies
    let freshCsrfToken = initialCsrfToken;
    try {
      const csrfResp = await axios.get(
        'https://www.myfitnesspal.com/api/auth/csrf',
        {
          headers: { ...baseHeaders, Cookie: currentCookies },
        }
      );
      if (csrfResp.data && csrfResp.data.csrfToken) {
        freshCsrfToken = csrfResp.data.csrfToken;
      }
      // Update cookies if server sent new ones
      const setCookie = csrfResp.headers['set-cookie'];
      if (setCookie) {
        const newCookies = setCookie.map((c) => c.split(';')[0]).join('; ');
        currentCookies = `${currentCookies}; ${newCookies}`;
      }
    } catch (e: any) {
      log(
        'warn',
        `pushNutritionToMFP: CSRF fetch fallback for user ${userId}: ${e.message}`
      );
    }

    // Step 2: Fetch Bearer Token
    let bearerToken = '';
    let mfpUserId = '';
    try {
      const authResp = await axios.get(
        'https://www.myfitnesspal.com/user/auth_token',
        {
          headers: {
            ...baseHeaders,
            Cookie: currentCookies,
            'x-csrf-token': freshCsrfToken,
            'csrf-token': freshCsrfToken,
            'mfp-client-id': 'mfp-main-js',
          },
        }
      );

      if (authResp.data && authResp.data.access_token) {
        bearerToken = authResp.data.access_token;
        mfpUserId = authResp.data.user_id;
      } else {
        throw new Error('Access token missing in response.');
      }
    } catch (e: any) {
      log(
        'error',
        `pushNutritionToMFP: Auth failed for user ${userId}: ${e.message}`
      );
      throw new Error(`Authentication failed: ${e.message}`);
    }

    const authHeaders: Record<string, string> = {
      ...baseHeaders,
      Authorization: `Bearer ${bearerToken}`,
      'mfp-client-id': 'mfp-main-js',
      Cookie: currentCookies,
      ...(mfpUserId ? { 'mfp-user-id': String(mfpUserId) } : {}),
    };

    // Step 3: Idempotency - Delete *ANY* existing entries that look like automated syncs for this date
    try {
      // Broaden discovery. If v2/diary with types fails, we'll try a fallback.
      // We suspect 'water' or 'exercise' might be causing the 400.
      const discoveryUrl = `https://api.myfitnesspal.com/v2/diary?entry_date=${data.date}&types=diary_meal,food_entry`;
      let diaryResp;
      try {
        diaryResp = await axios.get(discoveryUrl, { headers: authHeaders });
      } catch (e: unknown) {
        const err = e as {
          response?: { status?: number; data?: unknown };
          message?: string;
        };
        log(
          'error',
          `pushNutritionToMFP: Primary discovery failed with ${err.response?.status}: ${JSON.stringify(err.response?.data || err.message)}`
        );
        // Fallback to minimal discovery
        diaryResp = await axios.get(
          `https://api.myfitnesspal.com/v2/diary?entry_date=${data.date}`,
          { headers: authHeaders }
        );
      }

      if (diaryResp.data && Array.isArray(diaryResp.data.items)) {
        const items = diaryResp.data.items;
        log(
          'info',
          `pushNutritionToMFP: Discovery returned ${items.length} items for ${data.date}.`
        );

        // Log all discovered items
        for (const item of items) {
          const itemId = item.id || item.item_id;
          const itemType = item.type;
          const itemName = item.food_name || item.diary_meal || 'Unnamed Entry';
          log(
            'info',
            `pushNutritionToMFP: [DISCOVERY] Found item: ID=${itemId}, Type=${itemType}, Name="${itemName}"`
          );
          if (!itemId) {
            log(
              'info',
              `pushNutritionToMFP: [DEBUG] Item has NO ID at top level. Full structure: ${JSON.stringify(item)}`
            );
          }
        }

        // Delete in parallel with a concurrency limit to avoid rate limiting
        const itemsWithId = items.filter(
          (item: Record<string, unknown>) => item.id || item.item_id
        );
        for (let i = 0; i < itemsWithId.length; i += DELETE_CONCURRENCY) {
          const batch = itemsWithId.slice(i, i + DELETE_CONCURRENCY);
          await Promise.all(
            batch.map(async (item: Record<string, unknown>) => {
              const itemId = item.id || item.item_id;
              try {
                log(
                  'info',
                  `pushNutritionToMFP: Attempting to DELETE item ${itemId}...`
                );
                const delResp = await axios.delete(
                  `https://api.myfitnesspal.com/v2/diary/${itemId}`,
                  { headers: authHeaders }
                );
                log(
                  'info',
                  `pushNutritionToMFP: Successfully deleted item ${itemId}. Status: ${delResp.status}`
                );
              } catch (e: unknown) {
                const err = e as {
                  message?: string;
                  response?: { data?: unknown };
                };
                log(
                  'warn',
                  `pushNutritionToMFP: Delete failed for item ${itemId}: ${err.message} (Payload: ${JSON.stringify(err.response?.data || {})})`
                );
              }
            })
          );
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      log(
        'warn',
        `pushNutritionToMFP: Idempotency cleanup failed for user ${userId}: ${err.message}`
      );
    }

    // Step 4: Map and Push categories
    const responses = [];
    const mealMapping: { [key: string]: string } = {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snacks: 'Snacks',
    };

    for (const [categoryName, categoryData] of Object.entries(
      data.categories
    )) {
      if (categoryData.calories < 0) continue; // Skip negative (invalid) categories only

      const mfpMealName = mealMapping[categoryName.toLowerCase()] || 'Snacks';

      const payload = {
        items: [
          {
            type: 'quick_add',
            date: data.date,
            meal_name: mfpMealName,
            nutritional_contents: {
              energy: {
                unit: 'calories',
                value: Math.round(categoryData.calories),
              },
              carbohydrates: Number(categoryData.carbohydrate),
              fat: Number(categoryData.fat),
              protein: Number(categoryData.protein),
            },
          },
        ],
      };

      log(
        'info',
        `pushNutritionToMFP: Pushing ${mfpMealName} total for ${data.date}: ${categoryData.calories} kcal`
      );
      const finalResp = await axios.post(
        'https://api.myfitnesspal.com/v2/diary',
        payload,
        { headers: authHeaders }
      );

      if (finalResp.status >= 400) {
        log(
          'error',
          `pushNutritionToMFP: MFP API rejected ${mfpMealName} sync: ${JSON.stringify(finalResp.data)}`
        );
      } else {
        responses.push(finalResp.data);
      }
    }

    return {
      status: 'success',
      date: data.date,
      responses: responses,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    log(
      'error',
      `pushNutritionToMFP: Final fatal error for user ${userId}:`,
      err.response?.data || err.message
    );
    throw error;
  }
}
