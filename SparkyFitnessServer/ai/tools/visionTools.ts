import { tool } from 'ai';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';
import { log } from '../../config/logging.js';
import foodPhotoEstimationService from '../../services/foodPhotoEstimationService.js';
import labelScanService from '../../services/labelScanService.js';
import { formatZodError } from './errors.js';
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
  | { ok: false; reason: 'remote_url' | 'invalid' };

// Accepts data: URLs and bare base64 only. Remote http(s) URLs are rejected
// rather than fetched server-side (MCP passed them through to the AI
// provider; named drift).
function parseImageInput(imageUrl: string): ParsedImage {
  const value = imageUrl.trim();
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

function imageInputError(reason: 'remote_url' | 'invalid'): string {
  return reason === 'remote_url'
    ? 'Remote image URLs are not supported. Please attach the image directly to the chat.'
    : 'The provided data: URL is not a valid base64-encoded image.';
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

export function buildVisionTools(userId: string) {
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
          const image = parseImageInput(parsed.data.image_url);
          if (!image.ok) {
            return `❌ Error analyzing image: ${imageInputError(image.reason)}`;
          }
          const result =
            await foodPhotoEstimationService.estimateFoodPhotoNutrition({
              images: [{ base64: image.base64, mimeType: image.mimeType }],
              userId,
            });
          if (!result.success) {
            if (result.code === 'NO_AI_CONFIGURED') {
              return '⚠️ Vision is not configured.\n\nNo AI service is configured. To enable food image analysis, configure an AI service in the chat settings.';
            }
            return `❌ Error analyzing image: ${result.error}`;
          }
          return `🔬 Food Image Analysis Result:\n\n${renderFoodPhotoEstimate(result.estimate)}`;
        } catch (error) {
          log('error', '[Vision Tool] analyzeFoodImage error:', error);
          return `❌ Error analyzing image: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
          const image = parseImageInput(parsed.data.image_url);
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
