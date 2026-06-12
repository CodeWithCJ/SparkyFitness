import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildVisionTools } from '../ai/tools/visionTools.js';
import foodPhotoEstimationService from '../services/foodPhotoEstimationService.js';
import labelScanService from '../services/labelScanService.js';

vi.mock('../services/foodPhotoEstimationService', () => ({
  default: {
    estimateFoodPhotoNutrition: vi.fn(),
  },
}));
vi.mock('../services/labelScanService', () => ({
  default: {
    extractNutritionFromLabel: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };

// A syntactically valid base64 JPEG prefix.
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQ==';
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUg==';

const ESTIMATE = {
  meal_summary: 'Grilled chicken with rice and broccoli',
  overall_confidence: 'medium' as const,
  confidence_reason: 'portion depth not visible',
  items: [
    {
      name: 'grilled chicken thigh',
      estimated_grams: 150,
      portion_description: '1 medium thigh',
      preparation: 'grilled',
      calories_kcal: 250,
      protein_g: 25,
      carbs_g: 0,
      fat_g: 15,
      fiber_g: 0,
      sugar_g: 0,
      item_confidence: 'high' as const,
      assumptions: ['assumed skinless'],
    },
    {
      name: 'white jasmine rice',
      estimated_grams: 200,
      portion_description: '1 cup cooked',
      preparation: '',
      calories_kcal: 260,
      protein_g: 5,
      carbs_g: 57,
      fat_g: 1,
      fiber_g: 1,
      sugar_g: 0,
      item_confidence: 'medium' as const,
      assumptions: [],
    },
  ],
  totals: {
    calories_kcal: 510,
    protein_g: 30,
    carbs_g: 57,
    fat_g: 16,
    fiber_g: 1,
    sugar_g: 0,
    total_grams: 350,
  },
  user_weight_reconciliation: '',
  clarifying_questions: ['Was the chicken cooked with oil or butter?'],
};

let tools: ReturnType<typeof buildVisionTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildVisionTools('user-1');
});

describe('sparky_analyze_food_image', () => {
  it('parses a data: URL and renders the structured estimate', async () => {
    vi.mocked(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).mockResolvedValue({ success: true, estimate: ESTIMATE });

    const result = await tools.sparky_analyze_food_image.execute!(
      { image_url: `data:image/png;base64,${PNG_BASE64}` },
      opts
    );

    expect(result).toBe(
      '🔬 Food Image Analysis Result:\n\n' +
        '**Grilled chicken with rice and broccoli** (confidence: medium)\n' +
        'Confidence notes: portion depth not visible\n' +
        '\n' +
        'Items:\n' +
        '- grilled chicken thigh (1 medium thigh, ~150g, grilled): 250 kcal | P: 25g | C: 0g | F: 15g | Fiber: 0g | Sugar: 0g\n' +
        '  Assumptions: assumed skinless\n' +
        '- white jasmine rice (1 cup cooked, ~200g): 260 kcal | P: 5g | C: 57g | F: 1g | Fiber: 1g | Sugar: 0g\n' +
        '\n' +
        'Total (~350g): 510 kcal | P: 30g | C: 57g | F: 16g | Fiber: 1g | Sugar: 0g\n' +
        '\n' +
        'To improve this estimate, the user could clarify:\n' +
        '- Was the chicken cooked with oil or butter?'
    );
    expect(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).toHaveBeenCalledWith({
      images: [{ base64: PNG_BASE64, mimeType: 'image/png' }],
      userId: 'user-1',
    });
  });

  it('sniffs the MIME type of bare base64 input', async () => {
    vi.mocked(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).mockResolvedValue({
      success: true,
      estimate: {
        ...ESTIMATE,
        confidence_reason: '',
        items: [],
        user_weight_reconciliation: 'Distributed 350g across items.',
        clarifying_questions: [],
      },
    });

    const result = await tools.sparky_analyze_food_image.execute!(
      { image_url: JPEG_BASE64 },
      opts
    );

    expect(result).toBe(
      '🔬 Food Image Analysis Result:\n\n' +
        '**Grilled chicken with rice and broccoli** (confidence: medium)\n' +
        '\n' +
        'Items:\n' +
        '\n' +
        'Total (~350g): 510 kcal | P: 30g | C: 57g | F: 16g | Fiber: 1g | Sugar: 0g\n' +
        '\n' +
        'Weight reconciliation: Distributed 350g across items.'
    );
    expect(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).toHaveBeenCalledWith({
      images: [{ base64: JPEG_BASE64, mimeType: 'image/jpeg' }],
      userId: 'user-1',
    });
  });

  it('rejects remote URLs without calling the estimation service', async () => {
    const result = await tools.sparky_analyze_food_image.execute!(
      { image_url: 'https://example.com/meal.jpg' },
      opts
    );

    expect(result).toBe(
      '❌ Error analyzing image: Remote image URLs are not supported. Please attach the image directly to the chat.'
    );
    expect(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).not.toHaveBeenCalled();
  });

  it('rejects a malformed data: URL', async () => {
    const result = await tools.sparky_analyze_food_image.execute!(
      { image_url: 'data:text/plain;base64,aGVsbG8=' },
      opts
    );

    expect(result).toBe(
      '❌ Error analyzing image: The provided data: URL is not a valid base64-encoded image.'
    );
  });

  it('explains how to enable vision when no AI service is configured', async () => {
    vi.mocked(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).mockResolvedValue({
      success: false,
      code: 'NO_AI_CONFIGURED',
      error: 'No AI service configured.',
    });

    const result = await tools.sparky_analyze_food_image.execute!(
      { image_url: JPEG_BASE64 },
      opts
    );

    expect(result).toBe(
      '⚠️ Vision is not configured.\n\nNo AI service is configured. To enable food image analysis, configure an AI service in the chat settings.'
    );
  });

  it('surfaces other estimation failures as analysis errors', async () => {
    vi.mocked(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).mockResolvedValue({
      success: false,
      code: 'UPSTREAM_ERROR',
      error: 'Provider returned HTTP 500',
    });

    const result = await tools.sparky_analyze_food_image.execute!(
      { image_url: JPEG_BASE64 },
      opts
    );

    expect(result).toBe('❌ Error analyzing image: Provider returned HTTP 500');
  });

  it('never throws when the service rejects', async () => {
    vi.mocked(
      foodPhotoEstimationService.estimateFoodPhotoNutrition
    ).mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_analyze_food_image.execute!(
      { image_url: JPEG_BASE64 },
      opts
    );

    expect(result).toBe('❌ Error analyzing image: boom');
  });

  it('returns a validation error when image_url is missing', async () => {
    const result = await tools.sparky_analyze_food_image.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: image_url: Invalid input: expected string, received undefined'
    );
  });
});

describe('sparky_scan_label', () => {
  it('renders extracted nutrition as JSON inside the scan wrapper', async () => {
    const nutrition = {
      name: 'Oat Crunch Cereal',
      brand: 'Acme',
      serving_size: 40,
      serving_unit: 'g',
      calories: 150,
      protein: 5,
      carbs: 30,
      fat: 2.5,
    };
    vi.mocked(labelScanService.extractNutritionFromLabel).mockResolvedValue({
      success: true,
      nutrition,
    });

    const result = await tools.sparky_scan_label.execute!(
      { image_url: `data:image/jpeg;base64,${JPEG_BASE64}` },
      opts
    );

    expect(result).toBe(
      `🏷️ Nutrition Label Scan Result:\n\n${JSON.stringify(nutrition, null, 2)}`
    );
    expect(labelScanService.extractNutritionFromLabel).toHaveBeenCalledWith(
      JPEG_BASE64,
      'image/jpeg',
      'user-1'
    );
  });

  it('rejects remote URLs without calling the scan service', async () => {
    const result = await tools.sparky_scan_label.execute!(
      { image_url: 'http://example.com/label.png' },
      opts
    );

    expect(result).toBe(
      '❌ Error scanning label: Remote image URLs are not supported. Please attach the image directly to the chat.'
    );
    expect(labelScanService.extractNutritionFromLabel).not.toHaveBeenCalled();
  });

  it('explains how to enable vision when no AI service is configured', async () => {
    vi.mocked(labelScanService.extractNutritionFromLabel).mockResolvedValue({
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    });

    const result = await tools.sparky_scan_label.execute!(
      { image_url: JPEG_BASE64 },
      opts
    );

    expect(result).toBe(
      '⚠️ Vision is not configured.\n\nNo AI service is configured. To enable nutrition label scanning, configure an AI service in the chat settings.'
    );
  });

  it('surfaces scan failures with the service detail', async () => {
    vi.mocked(labelScanService.extractNutritionFromLabel).mockResolvedValue({
      success: false,
      category: 'parse_error',
      error: 'Model returned malformed JSON',
    });

    const result = await tools.sparky_scan_label.execute!(
      { image_url: JPEG_BASE64 },
      opts
    );

    expect(result).toBe(
      '❌ Error scanning label: Model returned malformed JSON'
    );
  });

  it('never throws when the service rejects', async () => {
    vi.mocked(labelScanService.extractNutritionFromLabel).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_scan_label.execute!(
      { image_url: JPEG_BASE64 },
      opts
    );

    expect(result).toBe('❌ Error scanning label: boom');
  });
});
