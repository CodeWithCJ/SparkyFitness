import {
  prepareOpenFoodFactsImage,
  isOpenFoodFactsContributionCandidate,
} from '@/utils/openFoodFactsContribution';
import type { Food } from '@/types/food';

const food: Food = {
  id: 'food-1',
  name: 'Cereal',
  is_custom: true,
  user_id: 'user-1',
  barcode: '4008400402222',
};

describe('manual Open Food Facts food eligibility', () => {
  it('accepts the explicit custom source while keeping imported sources excluded', () => {
    expect(
      isOpenFoodFactsContributionCandidate(
        { ...food, provider_type: 'custom' },
        'user-1'
      )
    ).toBe(true);
    expect(
      isOpenFoodFactsContributionCandidate(
        { ...food, provider_type: 'fatsecret' },
        'user-1'
      )
    ).toBe(false);
  });

  it('allows only an owned custom food without imported provider provenance', () => {
    expect(isOpenFoodFactsContributionCandidate(food, 'user-1')).toBe(true);
    expect(isOpenFoodFactsContributionCandidate(food, 'other-user')).toBe(
      false
    );
    expect(
      isOpenFoodFactsContributionCandidate(
        { ...food, is_custom: false },
        'user-1'
      )
    ).toBe(false);
    expect(
      isOpenFoodFactsContributionCandidate(
        { ...food, provider_type: 'openfoodfacts' },
        'user-1'
      )
    ).toBe(false);
    expect(
      isOpenFoodFactsContributionCandidate(
        { ...food, provider_external_id: 'copied-product' },
        'user-1'
      )
    ).toBe(false);
  });
});

describe('fresh Open Food Facts photo preparation', () => {
  const close = jest.fn();
  const drawImage = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    global.createImageBitmap = jest
      .fn()
      .mockResolvedValue({ width: 4000, height: 3000, close });
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      fillRect: jest.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,anBlZw==');
  });
  afterEach(() => jest.restoreAllMocks());

  it('re-encodes a bounded JPEG and returns bytes without a data URL prefix', async () => {
    expect(
      await prepareOpenFoodFactsImage(
        new File(['photo'], 'nutrition.png', { type: 'image/png' })
      )
    ).toBe('anBlZw==');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2400, 1800);
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith(
      'image/jpeg',
      0.9
    );
    expect(close).toHaveBeenCalled();
  });

  it('rejects tiny photos instead of upscaling them for publication', async () => {
    jest
      .mocked(createImageBitmap)
      .mockResolvedValue({ width: 320, height: 240, close } as ImageBitmap);
    await expect(
      prepareOpenFoodFactsImage(
        new File(['photo'], 'front.jpg', { type: 'image/jpeg' })
      )
    ).rejects.toThrow();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('rejects non-photo files before decoding', async () => {
    await expect(
      prepareOpenFoodFactsImage(
        new File(['<svg/>'], 'label.svg', { type: 'image/svg+xml' })
      )
    ).rejects.toThrow();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
