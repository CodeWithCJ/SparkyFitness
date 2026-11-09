import { nutritionLabelScanResultSchema } from '@workspace/shared';
import { labelScanToFood, prepareLabelImage } from '@/utils/nutritionLabelScan';
import { resizeImageBase64 } from '@/utils/imageResize';

// jsdom cannot decode images, so the canvas resize is replaced here; its own
// behavior is not under test.
jest.mock('@/utils/imageResize', () => ({
  resizeImageBase64: jest.fn(),
}));

const resize = jest.mocked(resizeImageBase64);

describe('labelScanToFood', () => {
  it('maps every label field onto one default serving', () => {
    const food = labelScanToFood(
      nutritionLabelScanResultSchema.parse({
        name: 'Oat Bar',
        brand: 'Acme',
        serving_size: 40,
        serving_unit: 'g',
        calories: 180,
        protein: 4,
        carbs: 27,
        fat: 6,
        fiber: 3,
        saturated_fat: 1,
        trans_fat: 0,
        sodium: 95,
        sugars: 9,
        cholesterol: 0,
        potassium: 120,
        calcium: 20,
        iron: 1.1,
        vitamin_a: 5,
        vitamin_c: 2,
      })
    );

    expect(food).toMatchObject({
      id: '',
      name: 'Oat Bar',
      brand: 'Acme',
      is_custom: true,
    });
    expect(food.variants).toEqual([
      {
        serving_size: 40,
        serving_unit: 'g',
        calories: 180,
        protein: 4,
        carbs: 27,
        fat: 6,
        dietary_fiber: 3,
        saturated_fat: 1,
        trans_fat: 0,
        sodium: 95,
        sugars: 9,
        cholesterol: 0,
        potassium: 120,
        calcium: 20,
        iron: 1.1,
        vitamin_a: 5,
        vitamin_c: 2,
        caffeine_mg: undefined,
        water_ml: undefined,
        alcohol_g: undefined,
        is_default: true,
      },
    ]);
  });

  it('leaves the name empty and fills the main macros with 0 when unread', () => {
    const food = labelScanToFood(
      nutritionLabelScanResultSchema.parse({ serving_size: 30 })
    );
    const variant = food.variants?.[0];

    expect(food.name).toBe('');
    expect(food.brand).toBeNull();
    expect(variant).toMatchObject({
      serving_size: 30,
      serving_unit: 'g',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(variant?.sodium).toBeUndefined();
  });

  it('reads the amounts as one serving when no serving size is printed', () => {
    const variant = labelScanToFood(
      nutritionLabelScanResultSchema.parse({ calories: 90 })
    ).variants?.[0];

    expect(variant?.serving_size).toBe(1);
    expect(variant?.serving_unit).toBe('serving');
  });
});

describe('prepareLabelImage', () => {
  beforeEach(() => resize.mockReset());

  it('sends the resized image as base64 with its own type', async () => {
    resize.mockResolvedValue('data:image/jpeg;base64,c21hbGw=');

    const request = await prepareLabelImage(
      new File(['large'], 'label.png', { type: 'image/png' })
    );

    expect(resize).toHaveBeenCalledWith(
      expect.stringMatching(/^data:image\/png;base64,/),
      1600
    );
    expect(request).toEqual({ mime_type: 'image/jpeg', image: 'c21hbGw=' });
  });

  it('fails when the file does not give an image data URL', async () => {
    resize.mockResolvedValue('not a data url');

    await expect(
      prepareLabelImage(new File(['x'], 'label.png', { type: 'image/png' }))
    ).rejects.toThrow('Image could not be encoded');
  });
});
