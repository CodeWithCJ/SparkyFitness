import { tool } from 'ai';
import { log } from '../../config/logging.js';
import foodCoreService from '../../services/foodCoreService.js';
import { ERRORS, formatZodError } from './errors.js';
import {
  BARCODE_ACTIONS,
  barcodeSchema,
  barcodeInput,
  type BarcodeInput,
} from './schemas/barcode.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...BARCODE_ACTIONS];

interface BarcodeVariantView {
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface BarcodeFoodView {
  id?: string;
  name: string;
  brand?: string | null;
  default_variant: BarcodeVariantView;
}

interface BarcodeResultView {
  source: string;
  food: BarcodeFoodView | null;
}

export function buildBarcodeTools(userId: string, tz: string) {
  return {
    sparky_get_barcode: tool({
      description:
        'Look up a food product by its barcode (lookup_barcode). Searches your saved foods first, then configured external providers (OpenFoodFacts, FatSecret, etc.), and returns the matched food with per-serving macros. Read-only.',
      inputSchema: barcodeInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs as Record<string, unknown>,
          tz,
          VALID_ACTIONS,
          () => 'lookup_barcode'
        );

        const parsed = barcodeSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: BarcodeInput = parsed.data;

        try {
          switch (args.action) {
            case 'lookup_barcode': {
              const result = (await foodCoreService.lookupBarcode(
                args.barcode,
                userId,
                args.provider_id,
                userId
              )) as unknown as BarcodeResultView;

              if (result.source === 'not_found' || result.food === null) {
                return `No food found for barcode ${args.barcode}.`;
              }

              const food = result.food;
              const variant = food.default_variant;
              const lines = [
                `# Barcode ${args.barcode}`,
                '',
                food.brand !== null &&
                food.brand !== undefined &&
                food.brand !== ''
                  ? `**${food.name}** (${food.brand})`
                  : `**${food.name}**`,
                `- Source: ${result.source}`,
                `- Per ${variant.serving_size} ${variant.serving_unit}: ${variant.calories} kcal, P ${variant.protein}g / C ${variant.carbs}g / F ${variant.fat}g`,
              ];
              if (food.id !== undefined && food.id !== null && food.id !== '') {
                lines.push(`- ID: ${food.id}`);
              }
              return lines.join('\n');
            }
            default:
              return ERRORS.INVALID_ACTION(
                String((args as BarcodeInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Barcode Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
