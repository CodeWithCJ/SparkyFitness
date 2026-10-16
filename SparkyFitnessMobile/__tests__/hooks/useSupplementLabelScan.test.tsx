import { renderHook, waitFor } from '@testing-library/react-native';
import { useSupplementLabelScan } from '../../src/hooks/useSupplementLabelScan';
import { scanSupplementLabelOnDevice } from '../../src/services/onDeviceSupplementScan';
import {
  mapSupplementLabel,
  scanSupplementLabelImage,
} from '../../src/services/api/medicationsApi';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/onDeviceSupplementScan', () => ({
  scanSupplementLabelOnDevice: jest.fn(),
}));
jest.mock('../../src/services/api/medicationsApi', () => ({
  mapSupplementLabel: jest.fn(),
  scanSupplementLabelImage: jest.fn(),
}));

const product = { source: 'label', name: 'Zinc' } as never;
const label = {
  name: 'Zinc',
  brand: null,
  form: null,
  serving: null,
  ingredients: [{ name: 'Zinc', amount: 15, unit: 'mg' }],
};

const renderScan = () =>
  renderHook(() => useSupplementLabelScan(), {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });

describe('useSupplementLabelScan', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps what the phone read on device and skips the server AI', async () => {
    jest.mocked(scanSupplementLabelOnDevice).mockResolvedValue(label);
    jest.mocked(mapSupplementLabel).mockResolvedValue({ product });
    const { result } = renderScan();

    result.current.mutate('AAA');

    await waitFor(() =>
      expect(result.current.data).toEqual({ product, source: 'device' })
    );
    expect(mapSupplementLabel).toHaveBeenCalledWith(label);
    expect(scanSupplementLabelImage).not.toHaveBeenCalled();
  });

  it('sends the photo to the server when the phone cannot read it', async () => {
    jest.mocked(scanSupplementLabelOnDevice).mockResolvedValue(null);
    jest.mocked(scanSupplementLabelImage).mockResolvedValue({ product });
    const { result } = renderScan();

    result.current.mutate('AAA');

    await waitFor(() =>
      expect(result.current.data).toEqual({ product, source: 'server' })
    );
    expect(scanSupplementLabelImage).toHaveBeenCalledWith('AAA');
    expect(mapSupplementLabel).not.toHaveBeenCalled();
  });
});
