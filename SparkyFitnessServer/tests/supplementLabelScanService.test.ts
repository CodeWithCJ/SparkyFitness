import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../models/chatRepository.js', () => ({
  default: {
    getActiveVisionAiServiceSetting: vi.fn(),
    getAiServiceSettingForBackend: vi.fn(),
  },
}));
vi.mock('../ai/providerDispatch.js', () => ({ dispatchAiRequest: vi.fn() }));
vi.mock('../utils/outboundUrlPolicy.js', () => ({
  resolveAiNetworkPolicy: vi.fn(async () => ({})),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import chatRepository from '../models/chatRepository.js';
import { dispatchAiRequest } from '../ai/providerDispatch.js';
import {
  extractSupplementLabel,
  normalizeSupplementLabel,
} from '../services/supplementLabelScanService.js';

describe('normalizeSupplementLabel', () => {
  it('reads loose values and drops lines without a name', () => {
    const label = normalizeSupplementLabel({
      name: ' Daily Multi ',
      brand: '',
      form: 'Tablet',
      serving: '2 Tablets',
      ingredients: [
        { name: 'Vitamin C', amount: '90', unit: 'mg' },
        { name: 'Calcium', amount: '1,000', unit: 'mg' },
        { name: 'Magnesium', amount: '1 200', unit: 'mg' },
        { name: 'Iron', amount: '   ', unit: 'mg' },
        { amount: 5, unit: 'mg' },
        { name: 'Zinc', amount: 'n/a', unit: null },
      ],
    });

    expect(label).toEqual({
      name: 'Daily Multi',
      brand: null,
      form: 'tablet',
      serving: '2 Tablets',
      ingredients: [
        { name: 'Vitamin C', amount: 90, unit: 'mg' },
        { name: 'Calcium', amount: 1000, unit: 'mg' },
        { name: 'Magnesium', amount: 1200, unit: 'mg' },
        { name: 'Iron', amount: null, unit: 'mg' },
        { name: 'Zinc', amount: null, unit: null },
      ],
    });
  });

  it('drops a form the app does not offer instead of failing', () => {
    const label = normalizeSupplementLabel({
      form: 'lozenge',
      ingredients: [{ name: 'Zinc', amount: 15, unit: 'mg' }],
    });
    expect(label?.form).toBeNull();
  });

  it('is null when nothing usable was read', () => {
    expect(normalizeSupplementLabel(null)).toBeNull();
    expect(normalizeSupplementLabel({ ingredients: [] })).toBeNull();
  });
});

describe('extractSupplementLabel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports no AI configured', async () => {
    vi.mocked(chatRepository.getActiveVisionAiServiceSetting).mockResolvedValue(
      null as never
    );
    const result = await extractSupplementLabel('abc', 'image/jpeg', 'u1');
    expect(result).toMatchObject({
      success: false,
      category: 'no_ai_configured',
    });
  });

  it('returns the normalized label from the provider', async () => {
    vi.mocked(chatRepository.getActiveVisionAiServiceSetting).mockResolvedValue(
      {
        id: 's1',
      } as never
    );
    vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue({
      service_type: 'openai',
      api_key: 'k',
    } as never);
    vi.mocked(dispatchAiRequest).mockResolvedValue({
      ok: true,
      json: {
        name: 'Zinc',
        ingredients: [{ name: 'Zinc', amount: 15, unit: 'mg' }],
      },
    } as never);

    const result = await extractSupplementLabel('abc', 'image/jpeg', 'u1');

    expect(result).toMatchObject({
      success: true,
      label: { name: 'Zinc', ingredients: [{ name: 'Zinc', amount: 15 }] },
    });
  });

  it('turns an unreadable answer into a parse error', async () => {
    vi.mocked(chatRepository.getActiveVisionAiServiceSetting).mockResolvedValue(
      {
        id: 's1',
      } as never
    );
    vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue({
      service_type: 'openai',
    } as never);
    vi.mocked(dispatchAiRequest).mockResolvedValue({
      ok: true,
      json: { ingredients: [] },
    } as never);

    const result = await extractSupplementLabel('abc', 'image/jpeg', 'u1');

    expect(result).toMatchObject({ success: false, category: 'parse_error' });
  });
});
