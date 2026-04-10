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

interface MFPSession {
  authHeaders: Record<string, string>;
  mfpUserId: string;
}

/**
 * Internal helper to authenticate with MyFitnessPal and get a session.
 */
async function getMFPSession(userId: string): Promise<MFPSession | null> {
  const mfpProvider = (await getExternalDataProviderByUserIdAndProviderName(
    userId,
    'myfitnesspal'
  )) as MFPProvider | null;

  if (!mfpProvider || !mfpProvider.app_key) {
    return null;
  }

  const cookiesStr = mfpProvider.app_key;
  const initialCsrfToken = mfpProvider.app_id || '';
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

  // 1. Fetch CSRF
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
    const setCookie = csrfResp.headers['set-cookie'];
    if (setCookie) {
      const newCookies = setCookie.map((c) => c.split(';')[0]).join('; ');
      currentCookies = `${currentCookies}; ${newCookies}`;
    }
  } catch (e: any) {
    log('warn', `MFP getSession: CSRF fetch fallback for ${userId}: ${e.message}`);
  }

  // 2. Fetch Bearer Token
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
      throw new Error('Access token missing.');
    }
  } catch (e: any) {
    log('error', `MFP getSession: Auth failed for ${userId}: ${e.message}`);
    throw new Error(`Authentication failed: ${e.message}`);
  }

  return {
    authHeaders: {
      ...baseHeaders,
      Authorization: `Bearer ${bearerToken}`,
      'mfp-client-id': 'mfp-main-js',
      Cookie: currentCookies,
      ...(mfpUserId ? { 'mfp-user-id': String(mfpUserId) } : {}),
    },
    mfpUserId: String(mfpUserId),
  };
}

/**
 * Pushes nutrition data to MyFitnessPal.
 */
export async function pushNutritionToMFP(
  userId: string,
  data: MFPNutritionData
) {
  try {
    const session = await getMFPSession(userId);
    if (!session) {
      log('info', `pushNutritionToMFP: No credentials for ${userId}. Skipping.`);
      return null;
    }
    const { authHeaders } = session;

    // Idempotency - Delete existing entries
    try {
      const discoveryUrl = `https://api.myfitnesspal.com/v2/diary?entry_date=${data.date}&types=diary_meal,food_entry`;
      let diaryResp;
      try {
        diaryResp = await axios.get(discoveryUrl, { headers: authHeaders });
      } catch (e: any) {
        diaryResp = await axios.get(
          `https://api.myfitnesspal.com/v2/diary?entry_date=${data.date}`,
          { headers: authHeaders }
        );
      }

      if (diaryResp.data && Array.isArray(diaryResp.data.items)) {
        const items = diaryResp.data.items;
        const itemsWithId = items.filter((item: any) => item.id || item.item_id);
        for (let i = 0; i < itemsWithId.length; i += DELETE_CONCURRENCY) {
          const batch = itemsWithId.slice(i, i + DELETE_CONCURRENCY);
          await Promise.all(
            batch.map(async (item: any) => {
              const itemId = item.id || item.item_id;
              try {
                await axios.delete(`https://api.myfitnesspal.com/v2/diary/${itemId}`, {
                  headers: authHeaders,
                });
              } catch (e) {}
            })
          );
        }
      }
    } catch (e: any) {
      log('warn', `pushNutritionToMFP: Cleanup failed for user ${userId}: ${e.message}`);
    }

    // Push categories
    const responses = [];
    const mealMapping: Record<string, string> = {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snacks: 'Snacks',
    };

    for (const [categoryName, categoryData] of Object.entries(data.categories)) {
      if (categoryData.calories < 0) continue;
      const mfpMealName = mealMapping[categoryName.toLowerCase()] || 'Snacks';
      const payload = {
        items: [
          {
            type: 'quick_add',
            date: data.date,
            meal_name: mfpMealName,
            nutritional_contents: {
              energy: { unit: 'calories', value: Math.round(categoryData.calories) },
              carbohydrates: Number(categoryData.carbohydrate),
              fat: Number(categoryData.fat),
              protein: Number(categoryData.protein),
            },
          },
        ],
      };

      const finalResp = await axios.post('https://api.myfitnesspal.com/v2/diary', payload, {
        headers: authHeaders,
      });
      if (finalResp.status < 400) responses.push(finalResp.data);
    }

    return { status: 'success', date: data.date, responses };
  } catch (error: any) {
    log('error', `pushNutritionToMFP: Fatal error for user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Pushes water intake to MyFitnessPal.
 */
export async function pushWaterToMFP(
  userId: string,
  date: string,
  milliliters: number
) {
  try {
    const session = await getMFPSession(userId);
    if (!session) return null;
    const { authHeaders } = session;

    log('info', `pushWaterToMFP: Pushing ${milliliters}ml water for ${userId} on ${date} (edit_total)`);

    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
    
    // The stats endpoint uses 'edit_total' to update the absolute total.
    // The date is controlled by the 'Referer' header in the MFP web API.
    const customHeaders = {
      ...authHeaders,
      'user-agent': userAgent,
      'Referer': `https://www.myfitnesspal.com/food/diary?date=${date}`,
      'origin': 'https://www.myfitnesspal.com',
    };

    const payload = {
      event: {
        type: 'water_logged',
        attrs: {
          type: 'edit_total',
          unit: 'ml',
          value: Math.round(milliliters),
          diary_version: 'mainapp',
        },
        user_agent: userAgent,
      },
    };

    const resp = await axios.post('https://www.myfitnesspal.com/stats', payload, {
      headers: customHeaders,
    });

    return resp.data;
  } catch (error: any) {
    log('error', `pushWaterToMFP: Error for user ${userId}:`, error.message);
    throw error;
  }
}
