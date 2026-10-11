import type { OnDeviceSupplementExtraction } from '../../modules/on-device-nutrition';

jest.mock('../../modules/on-device-nutrition', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(),
    scanLabel: jest.fn(),
    scanSupplementLabel: jest.fn(),
  },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import mockModuleImport from '../../modules/on-device-nutrition';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import {
  groundSupplementLabel,
  scanSupplementLabelOnDevice,
} from '../../src/services/onDeviceSupplementScan';

const mockModule = jest.mocked(mockModuleImport!);

const OCR = [
  'Supplement Facts',
  'Serving Size 2 Capsules',
  'Vitamin C 90 mg 100%',
  'Zinc 15 mg 136%',
  'Calcium 1,000 mg 77%',
].join('\n');

const extraction = (
  over: Partial<OnDeviceSupplementExtraction> = {}
): OnDeviceSupplementExtraction => ({
  name: 'Daily Multi',
  brand: 'Acme',
  form: 'Capsule',
  serving: '2 Capsules',
  ingredients: [
    { name: 'Vitamin C', amount: 90, unit: 'mg' },
    { name: 'Zinc', amount: 15, unit: 'mg' },
  ],
  ocr_text: OCR,
  ...over,
});

describe('groundSupplementLabel', () => {
  it('keeps lines whose name and amount are printed', () => {
    const label = groundSupplementLabel(extraction());

    expect(label).toEqual({
      name: 'Daily Multi',
      brand: 'Acme',
      form: 'capsule',
      serving: '2 Capsules',
      ingredients: [
        { name: 'Vitamin C', amount: 90, unit: 'mg' },
        { name: 'Zinc', amount: 15, unit: 'mg' },
      ],
    });
  });

  it('reads a thousands separator', () => {
    const label = groundSupplementLabel(
      extraction({
        ingredients: [{ name: 'Calcium', amount: 1000, unit: 'mg' }],
      })
    );
    expect(label?.ingredients).toHaveLength(1);
  });

  it('falls back when there is no recognised text to check against', () => {
    expect(groundSupplementLabel(extraction({ ocr_text: '' }))).toBeNull();
  });

  it('falls back when an invented amount is not on the label', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ingredients: [
            { name: 'Vitamin C', amount: 90, unit: 'mg' },
            { name: 'Zinc', amount: 40, unit: 'mg' },
          ],
        })
      )
    ).toBeNull();
  });

  it('reads a space as a thousands separator', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text: 'Calcium 1 200 mg',
          ingredients: [{ name: 'Calcium', amount: 200, unit: 'mg' }],
        })
      )
    ).toBeNull();
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text: 'Calcium 1 200 mg',
          ingredients: [{ name: 'Calcium', amount: 1200, unit: 'mg' }],
        })
      )?.ingredients
    ).toEqual([{ name: 'Calcium', amount: 1200, unit: 'mg' }]);
  });

  it('does not accept an amount when another unit is on the same line', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text: 'Vitamin C 90 mg Zinc 15 mcg',
          ingredients: [{ name: 'Zinc', amount: 90, unit: 'mg' }],
        })
      )
    ).toBeNull();
  });

  it('keeps ingredients separated when their units differ', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text: 'Vitamin C 90 mg; Zinc 15 mcg',
          ingredients: [
            { name: 'Vitamin C', amount: 90, unit: 'mg' },
            { name: 'Zinc', amount: 15, unit: 'mcg' },
          ],
        })
      )?.ingredients.map((i) => i.name)
    ).toEqual(['Vitamin C', 'Zinc']);
  });

  it('does not treat the digits of a leading-dot decimal as the amount', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text: 'Vitamin C .5 mg',
          ingredients: [{ name: 'Vitamin C', amount: 5, unit: 'mg' }],
        })
      )
    ).toBeNull();
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text: 'Vitamin C .5 mg',
          ingredients: [{ name: 'Vitamin C', amount: 0.5, unit: 'mg' }],
        })
      )?.ingredients
    ).toEqual([{ name: 'Vitamin C', amount: 0.5, unit: 'mg' }]);
  });

  it('does not take another ingredient amount from the same line', () => {
    const ocr_text = 'Vitamin C 90 mg; Zinc 15 mg';
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text,
          ingredients: [
            { name: 'Vitamin C', amount: 90, unit: 'mg' },
            { name: 'Zinc', amount: 90, unit: 'mg' },
          ],
        })
      )
    ).toBeNull();
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text,
          ingredients: [
            { name: 'Vitamin C', amount: 90, unit: 'mg' },
            { name: 'Zinc', amount: 15, unit: 'mg' },
          ],
        })
      )?.ingredients.map((i) => i.name)
    ).toEqual(['Vitamin C', 'Zinc']);
  });

  it('falls back when two ingredients share a line without a separator', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text: 'Vitamin C 90 mg Zinc 15 mg',
          ingredients: [
            { name: 'Vitamin C', amount: 90, unit: 'mg' },
            { name: 'Zinc', amount: 15, unit: 'mg' },
          ],
        })
      )
    ).toBeNull();
  });

  it('does not treat a percent daily value as the amount', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ingredients: [{ name: 'Vitamin C', amount: 100, unit: 'mg' }],
        })
      )
    ).toBeNull();
  });

  it('does not count a glued %DV as a second amount', () => {
    for (const ocr_text of [
      'Vitamin C 90 mg 100%DV',
      'Vitamin C 90 mg 100 DV',
    ]) {
      expect(
        groundSupplementLabel(
          extraction({
            ocr_text,
            ingredients: [{ name: 'Vitamin C', amount: 90, unit: 'mg' }],
          })
        )?.ingredients
      ).toEqual([{ name: 'Vitamin C', amount: 90, unit: 'mg' }]);
    }
  });

  it('does not borrow an amount from a similarly named ingredient', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ocr_text: ['Vitamin C 90 mg', 'Vitamin D 15 mcg'].join('\n'),
          ingredients: [
            { name: 'Vitamin C', amount: 90, unit: 'mg' },
            { name: 'Vitamin D', amount: 90, unit: 'mg' },
          ],
        })
      )
    ).toBeNull();
  });

  it('keeps vitamins that share a word when each line matches', () => {
    const label = groundSupplementLabel(
      extraction({
        ocr_text: ['Vitamin C 90 mg', 'Vitamin D 15 mcg'].join('\n'),
        ingredients: [
          { name: 'Vitamin C', amount: 90, unit: 'mg' },
          { name: 'Vitamin D', amount: 15, unit: 'mcg' },
        ],
      })
    );
    expect(label?.ingredients.map((i) => i.name)).toEqual([
      'Vitamin C',
      'Vitamin D',
    ]);
  });

  it('falls back when an amount is taken from a different line', () => {
    expect(
      groundSupplementLabel(
        extraction({
          ingredients: [
            { name: 'Vitamin C', amount: 90, unit: 'mg' },
            { name: 'Zinc', amount: 90, unit: 'mg' },
          ],
        })
      )
    ).toBeNull();
  });

  it('drops one ungrounded line when most of the label checks out', () => {
    const label = groundSupplementLabel(
      extraction({
        ingredients: [
          { name: 'Vitamin C', amount: 90, unit: 'mg' },
          { name: 'Zinc', amount: 15, unit: 'mg' },
          { name: 'Calcium', amount: 1000, unit: 'mg' },
          { name: 'Magnesium', amount: 400, unit: 'mg' },
        ],
      })
    );
    expect(label?.ingredients.map((i) => i.name)).toEqual([
      'Vitamin C',
      'Zinc',
      'Calcium',
    ]);
  });

  it('drops a form the app does not offer', () => {
    expect(
      groundSupplementLabel(extraction({ form: 'lozenge' }))?.form
    ).toBeNull();
  });

  it('falls back when the reading is outside the server schema', () => {
    expect(
      groundSupplementLabel(extraction({ name: 'A'.repeat(201) }))
    ).toBeNull();
  });
});

describe('scanSupplementLabelOnDevice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppPreferencesStore.setState({ onDeviceLabelScanEnabled: true });
    mockModule.isAvailable.mockReturnValue(true);
  });

  it('is skipped while the on-device setting is off', async () => {
    useAppPreferencesStore.setState({ onDeviceLabelScanEnabled: false });

    expect(await scanSupplementLabelOnDevice('abc')).toBeNull();
    expect(mockModule.scanSupplementLabel).not.toHaveBeenCalled();
  });

  it('is skipped when Apple Intelligence is unavailable', async () => {
    mockModule.isAvailable.mockReturnValue(false);

    expect(await scanSupplementLabelOnDevice('abc')).toBeNull();
  });

  it('returns the grounded reading', async () => {
    mockModule.scanSupplementLabel.mockResolvedValue(extraction());

    const label = await scanSupplementLabelOnDevice('abc');

    expect(label?.ingredients).toHaveLength(2);
  });

  it('falls back when the model throws', async () => {
    mockModule.scanSupplementLabel.mockRejectedValue(new Error('boom'));

    expect(await scanSupplementLabelOnDevice('abc')).toBeNull();
  });
});
