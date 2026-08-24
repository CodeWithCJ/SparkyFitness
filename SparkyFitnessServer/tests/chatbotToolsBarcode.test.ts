import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildBarcodeTools } from '../ai/tools/barcodeTools.js';
import foodCoreService from '../services/foodCoreService.js';

vi.mock('../services/foodCoreService.js', () => ({
  default: {
    lookupBarcode: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const svc = foodCoreService as unknown as {
  lookupBarcode: ReturnType<typeof vi.fn>;
};

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const VARIANT = {
  serving_size: 100,
  serving_unit: 'g',
  calories: 250,
  protein: 12,
  carbs: 30,
  fat: 8,
};

let tools: ReturnType<typeof buildBarcodeTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildBarcodeTools('user-1', 'UTC');
});

describe('sparky_get_barcode', () => {
  it('renders a found food with brand and ID', async () => {
    svc.lookupBarcode.mockResolvedValue({
      source: 'openfoodfacts',
      food: {
        id: 'food-9',
        name: 'Granola Bar',
        brand: 'ACME',
        default_variant: VARIANT,
      },
    });

    const result = await tools.sparky_get_barcode.execute!(
      { action: 'lookup_barcode', barcode: '01234567' },
      opts
    );

    expect(result).toBe(
      '# Barcode 01234567\n\n' +
        '**Granola Bar** (ACME)\n' +
        '- Source: openfoodfacts\n' +
        '- Per 100 g: 250 kcal, P 12g / C 30g / F 8g\n' +
        '- ID: food-9'
    );
    expect(svc.lookupBarcode).toHaveBeenCalledWith(
      '01234567',
      'user-1',
      undefined,
      'user-1'
    );
  });

  it('omits brand paren and ID line when absent', async () => {
    svc.lookupBarcode.mockResolvedValue({
      source: 'local',
      food: {
        name: 'Plain Food',
        brand: null,
        default_variant: VARIANT,
      },
    });

    const result = await tools.sparky_get_barcode.execute!(
      { barcode: '99887766' },
      opts
    );

    expect(result).toBe(
      '# Barcode 99887766\n\n' +
        '**Plain Food**\n' +
        '- Source: local\n' +
        '- Per 100 g: 250 kcal, P 12g / C 30g / F 8g'
    );
  });

  it('returns a friendly message when not found', async () => {
    svc.lookupBarcode.mockResolvedValue({ source: 'not_found', food: null });

    const result = await tools.sparky_get_barcode.execute!(
      { action: 'lookup_barcode', barcode: '00000000' },
      opts
    );

    expect(result).toBe('No food found for barcode 00000000.');
  });

  it('rejects a barcode that is not 8-14 digits', async () => {
    const result = await tools.sparky_get_barcode.execute!(
      { action: 'lookup_barcode', barcode: '123' },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: barcode: Barcode must be 8-14 digits'
    );
    expect(svc.lookupBarcode).not.toHaveBeenCalled();
  });

  it('returns a DB error string when the service throws', async () => {
    svc.lookupBarcode.mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_get_barcode.execute!(
      { action: 'lookup_barcode', barcode: '01234567' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
