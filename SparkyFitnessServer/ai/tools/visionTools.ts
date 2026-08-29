import { tool } from 'ai';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';
import { log } from '../../config/logging.js';
import foodPhotoEstimationService from '../../services/foodPhotoEstimationService.js';
import labelScanService from '../../services/labelScanService.js';
import { z } from 'zod';
import { formatZodError } from './errors.js';
import chatRepository from '../../models/chatRepository.js';
import foodPhotoLogService, {
  PhotoLogError,
} from '../../services/foodPhotoLogService.js';
import {
  asPortionMacros,
  toPer100g,
  unbrandMacros,
  roundMacros,
  type FoodPhotoLogItem,
} from '@workspace/shared';
import {
  FOOD_PHOTO_ESTIMATE_PART_TYPE,
  type FoodPhotoEstimateSink,
  type FoodPhotoEstimateCapture,
} from './foodPhotoEstimateSink.js';
import { AnalyzeFoodImageSchema, ScanLabelSchema } from './schemas/vision.js';

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

// Base64 magic-byte prefixes for common image formats, used to infer the MIME
// type of bare base64 input.
const BASE64_MIME_PREFIXES: [string, string][] = [
  ['/9j/', 'image/jpeg'],
  ['iVBOR', 'image/png'],
  ['R0lGOD', 'image/gif'],
  ['UklGR', 'image/webp'],
];

type ParsedImage =
  | { ok: true; base64: string; mimeType: string }
  | { ok: false; reason: 'remote_url' | 'invalid' | 'missing' };

// Accepts data: URLs and bare base64 only. Remote http(s) URLs are rejected
// rather than fetched server-side (MCP passed them through to the AI
// provider; named drift).
function parseImageInput(imageUrl: string): ParsedImage {
  const value = imageUrl.trim();
  // `image_url` is optional — the image normally rides on the attached message
  // — so an empty string means the turn carried no image at all. Without this
  // the empty value falls through as "bare base64" and an empty payload is
  // sent to the provider.
  if (!value) {
    return { ok: false, reason: 'missing' };
  }
  if (/^https?:\/\//i.test(value)) {
    return { ok: false, reason: 'remote_url' };
  }
  if (value.startsWith('data:')) {
    const match = DATA_URL_PATTERN.exec(value);
    if (!match) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, mimeType: match[1].toLowerCase(), base64: match[2] };
  }
  const mime = BASE64_MIME_PREFIXES.find(([prefix]) =>
    value.startsWith(prefix)
  );
  return { ok: true, base64: value, mimeType: mime ? mime[1] : 'image/jpeg' };
}

function imageInputError(reason: 'remote_url' | 'invalid' | 'missing'): string {
  switch (reason) {
    case 'remote_url':
      return 'Remote image URLs are not supported. Please attach the image directly to the chat.';
    case 'missing':
      return 'No image was provided. Attach the photo to your message and try again.';
    default:
      return 'The provided data: URL is not a valid base64-encoded image.';
  }
}

function renderFoodPhotoEstimate(estimate: FoodPhotoEstimateResponse): string {
  const lines: string[] = [];
  lines.push(
    `**${estimate.meal_summary}** (confidence: ${estimate.overall_confidence})`
  );
  if (estimate.confidence_reason) {
    lines.push(`Confidence notes: ${estimate.confidence_reason}`);
  }
  lines.push('');
  lines.push('Items:');
  for (const item of estimate.items) {
    const prep = item.preparation ? `, ${item.preparation}` : '';
    lines.push(
      `- ${item.name} (${item.portion_description}, ~${item.estimated_grams}g${prep}): ` +
        `${item.calories_kcal} kcal | P: ${item.protein_g}g | C: ${item.carbs_g}g | F: ${item.fat_g}g | Fiber: ${item.fiber_g}g | Sugar: ${item.sugar_g}g`
    );
    if (item.assumptions.length > 0) {
      lines.push(`  Assumptions: ${item.assumptions.join('; ')}`);
    }
  }
  lines.push('');
  const totals = estimate.totals;
  lines.push(
    `Total (~${totals.total_grams}g): ${totals.calories_kcal} kcal | P: ${totals.protein_g}g | C: ${totals.carbs_g}g | F: ${totals.fat_g}g | Fiber: ${totals.fiber_g}g | Sugar: ${totals.sugar_g}g`
  );
  if (estimate.user_weight_reconciliation) {
    lines.push('');
    lines.push(`Weight reconciliation: ${estimate.user_weight_reconciliation}`);
  }
  if (estimate.clarifying_questions.length > 0) {
    lines.push('');
    lines.push('To improve this estimate, the user could clarify:');
    for (const question of estimate.clarifying_questions) {
      lines.push(`- ${question}`);
    }
  }
  return lines.join('\n');
}

const LogFoodPhotoSchema = z.object({
  save_mode: z
    .enum(['ingredients_and_meal', 'one_food'])
    .describe(
      "How to save the plate. 'ingredients_and_meal' creates a reusable food per ingredient plus a reusable meal combining them; 'one_food' saves the whole plate as a single food."
    ),
  meal_type: z
    .string()
    .min(1)
    .describe(
      'breakfast | lunch | dinner | snacks, or a custom meal type name.'
    ),
  entry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Calendar day (YYYY-MM-DD).'),
  meal_name: z
    .string()
    .optional()
    .describe("Name for the meal; defaults to the analysis' own summary."),
});

/**
 * The estimate to log: this turn's if the photo was analysed in it, otherwise
 * the most recent one persisted on the chat transcript.
 *
 * The second case is the normal one. Asking the user how to save always ends
 * the turn (sparky_ask_user is a stop condition), so their answer arrives in a
 * fresh turn with an empty sink — and chat history strips images, so
 * re-analysing is not an option.
 */
async function loadLatestFoodPhotoEstimate(
  userId: string,
  sink?: FoodPhotoEstimateSink
): Promise<FoodPhotoEstimateCapture | null> {
  const fromThisTurn = sink?.get();
  if (fromThisTurn) return fromThisTurn;

  try {
    const history = await chatRepository.getChatHistoryByUserId(userId);
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const parts = history[i]?.parts;
      if (!Array.isArray(parts)) continue;
      const part = parts.find(
        (candidate: { type?: string }) =>
          candidate?.type === FOOD_PHOTO_ESTIMATE_PART_TYPE
      ) as { data?: FoodPhotoEstimateCapture } | undefined;
      if (part?.data?.estimate) return part.data;
    }
  } catch (error) {
    log(
      'warn',
      '[Vision Tool] could not read persisted photo estimate:',
      error
    );
  }
  return null;
}

/**
 * Turns a reviewed estimate into log items.
 *
 * Nutrition on an estimate item is per-portion; a created food stores per-100g.
 * `toPer100g` is the only bridge and its branded return type makes sending
 * per-portion numbers as per-100g a compile error.
 */
function buildPhotoLogItems(
  estimate: FoodPhotoEstimateResponse,
  saveMode: 'ingredients_and_meal' | 'one_food'
): FoodPhotoLogItem[] {
  if (saveMode === 'one_food') {
    const grams = estimate.totals.total_grams;
    const per100g = toPer100g(asPortionMacros(estimate.totals), grams);
    if (!per100g) return [];
    const rounded = unbrandMacros(roundMacros(per100g));
    return [
      {
        source: 'new',
        food: {
          name: estimate.meal_summary || 'Photo estimate',
          brand: null,
          serving_size: 100,
          serving_unit: 'g',
          calories: rounded.calories_kcal,
          protein: rounded.protein_g,
          carbs: rounded.carbs_g,
          fat: rounded.fat_g,
          dietary_fiber: rounded.fiber_g,
          sugars: rounded.sugar_g,
          ai_confidence: estimate.overall_confidence,
        },
        quantity: grams,
        unit: 'g',
      },
    ];
  }

  const items: FoodPhotoLogItem[] = [];
  for (const item of estimate.items) {
    const grams = item.estimated_grams;
    if (!Number.isFinite(grams) || grams <= 0) continue;

    // A preselected database match means verified nutrition already resolved
    // for this ingredient; prefer it over the model's own numbers.
    const match = item.preselect_match ? item.match : null;
    if (match?.food_id && match.variant_id) {
      items.push({
        source: 'existing',
        food_id: match.food_id,
        variant_id: match.variant_id,
        quantity: grams,
        unit: 'g',
      });
      continue;
    }

    const portion = asPortionMacros(match?.scaled ?? item);
    const per100g = toPer100g(portion, grams);
    if (!per100g) continue;
    const rounded = unbrandMacros(roundMacros(per100g));
    items.push({
      source: 'new',
      food: {
        name: item.name,
        brand: match?.brand ?? null,
        serving_size: 100,
        serving_unit: 'g',
        calories: rounded.calories_kcal,
        protein: rounded.protein_g,
        carbs: rounded.carbs_g,
        fat: rounded.fat_g,
        dietary_fiber: rounded.fiber_g,
        sugars: rounded.sugar_g,
        // Only a row still carrying the model's numbers is an estimate.
        ...(match ? {} : { ai_confidence: item.item_confidence }),
      },
      quantity: grams,
      unit: 'g',
    });
  }
  return items;
}

function renderPhotoLogResult(
  result: { created_food_ids: string[]; meal_template_id?: string | null },
  mealName: string,
  itemCount: number,
  saveMode: 'ingredients_and_meal' | 'one_food'
): string {
  if (saveMode === 'one_food') {
    return `✅ Logged "${mealName}" as a single food.`;
  }
  const lines = [
    `✅ Logged "${mealName}" as ${itemCount} ingredient${itemCount === 1 ? '' : 's'}.`,
  ];
  if (result.created_food_ids.length > 0) {
    lines.push(
      `Added ${result.created_food_ids.length} new food${result.created_food_ids.length === 1 ? '' : 's'} to your foods.`
    );
  }
  lines.push(
    result.meal_template_id
      ? `Saved "${mealName}" as a meal you can log again without a photo.`
      : 'The meal could not be saved as a template; the diary entries are logged.'
  );
  return lines.join('\n');
}

export function buildVisionTools(
  userId: string,
  estimateSink?: FoodPhotoEstimateSink,
  imageSource?: {
    latestImageDataUrl?: string | null;
    serviceConfigId?: string | null;
  }
) {
  return {
    sparky_analyze_food_image: tool({
      description:
        'Analyzes an image of food to estimate its nutritional content using advanced vision models.',
      inputSchema: AnalyzeFoodImageSchema,
      execute: async (rawArgs) => {
        const parsed = AnalyzeFoodImageSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          // The model cannot hand over the bytes of an image it can see, so
          // whatever it puts in `image_url` is usually a guess. Prefer the
          // image actually attached to this turn and fall back to the argument
          // only when there is none (an explicit data URL the user pasted).
          const attached = imageSource?.latestImageDataUrl;
          const image = parseImageInput(
            attached || parsed.data.image_url || ''
          );
          if (!image.ok) {
            return `❌ Error analyzing image: ${imageInputError(image.reason)}`;
          }
          const result =
            await foodPhotoEstimationService.estimateFoodPhotoNutrition({
              images: [{ base64: image.base64, mimeType: image.mimeType }],
              userId,
              serviceConfigId: imageSource?.serviceConfigId ?? undefined,
            });
          if (!result.success) {
            if (result.code === 'NO_AI_CONFIGURED') {
              return '⚠️ Vision is not configured.\n\nNo AI service is configured. To enable food image analysis, configure an AI service in the chat settings.';
            }
            return `❌ Error analyzing image: ${result.error}`;
          }
          // Hand the structured estimate to the turn so it can be persisted
          // and logged verbatim. The model still only sees the markdown, so
          // this changes nothing about what it reads.
          estimateSink?.set(result.estimate);
          return {
            text: `🔬 Food Image Analysis Result:\n\n${renderFoodPhotoEstimate(result.estimate)}`,
            estimate: result.estimate,
            meal_type: parsed.data.meal_type,
            entry_date: parsed.data.entry_date,
          };
        } catch (error) {
          log('error', '[Vision Tool] analyzeFoodImage error:', error);
          return `❌ Error analyzing image: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    }),

    sparky_log_food_photo: tool({
      description: `Logs the ingredients from the most recent sparky_analyze_food_image result to the diary, in one transaction.

Use this INSTEAD of retyping the numbers into sparky_manage_food — it keeps the per-ingredient breakdown and the database matches that the analysis already resolved.

- save_mode 'ingredients_and_meal': each ingredient becomes its own reusable food AND the plate is saved as a reusable meal, so the user can log it again later without a photo.
- save_mode 'one_food': the whole plate is logged as a single food with no breakdown.

Only call this when the user explicitly asks to log the plate in a message AFTER the analysis, whatever the ingredient count. sparky_analyze_food_image renders a review card the user logs from themselves, so logging here in the same turn duplicates their entry.`,
      inputSchema: LogFoodPhotoSchema,
      execute: async (rawArgs) => {
        const parsed = LogFoodPhotoSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args = parsed.data;
        try {
          const captured = await loadLatestFoodPhotoEstimate(
            userId,
            estimateSink
          );
          if (!captured) {
            return '❌ No recent food photo analysis to log. Call sparky_analyze_food_image with the photo first, then log its result.';
          }

          const items = buildPhotoLogItems(captured.estimate, args.save_mode);
          if (items.length === 0) {
            return '❌ That analysis has no ingredient with a usable weight, so there is nothing to log.';
          }

          const mealName =
            args.meal_name?.trim() ||
            captured.estimate.meal_summary ||
            'Photo estimate';

          const result = await foodPhotoLogService.createPhotoLoggedMeal(
            userId,
            userId,
            {
              mode: args.save_mode === 'one_food' ? 'combined' : 'grouped',
              entry_date: args.entry_date,
              entry_time: null,
              meal_type: args.meal_type,
              meal_type_id: null,
              name: mealName,
              description: captured.estimate.confidence_reason || null,
              items,
              // The chat flow logs the analysed plate as one serving, all of it
              // eaten. Splitting a dish into servings is done on the review
              // card, which sends its own serving model here.
              serving_size: 1,
              serving_unit: 'serving',
              total_servings: 1,
              consumed_quantity: 1,
              ...(args.save_mode === 'ingredients_and_meal'
                ? { save_as_meal: { name: mealName } }
                : {}),
            }
          );

          return renderPhotoLogResult(
            result,
            mealName,
            items.length,
            args.save_mode
          );
        } catch (error) {
          if (error instanceof PhotoLogError) {
            return `❌ Could not log the photo estimate: ${error.message}`;
          }
          log('error', '[Vision Tool] logFoodPhoto error:', error);
          return `❌ Could not log the photo estimate: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    }),
    sparky_scan_label: tool({
      description:
        'Scans a nutrition label from an image to extract detailed nutritional information using OCR.',
      inputSchema: ScanLabelSchema,
      execute: async (rawArgs) => {
        const parsed = ScanLabelSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        try {
          const attached = imageSource?.latestImageDataUrl;
          const image = parseImageInput(
            attached || parsed.data.image_url || ''
          );
          if (!image.ok) {
            return `❌ Error scanning label: ${imageInputError(image.reason)}`;
          }
          const result = await labelScanService.extractNutritionFromLabel(
            image.base64,
            image.mimeType,
            userId
          );
          if (!result.success) {
            if (result.category === 'no_ai_configured') {
              return '⚠️ Vision is not configured.\n\nNo AI service is configured. To enable nutrition label scanning, configure an AI service in the chat settings.';
            }
            return `❌ Error scanning label: ${result.error}`;
          }
          return `🏷️ Nutrition Label Scan Result:\n\n${JSON.stringify(result.nutrition)}`;
        } catch (error) {
          log('error', '[Vision Tool] scanLabel error:', error);
          return `❌ Error scanning label: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    }),
  };
}
