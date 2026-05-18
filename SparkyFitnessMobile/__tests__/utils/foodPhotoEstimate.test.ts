import {
  mapOverallConfidence,
  mapItemConfidence,
  confidenceTone,
  mapEstimateError,
} from '../../src/utils/foodPhotoEstimate';

describe('foodPhotoEstimate', () => {
  describe('confidence mapping', () => {
    test('overall labels: Good / Fair / Rough', () => {
      expect(mapOverallConfidence('high')).toBe('Good');
      expect(mapOverallConfidence('medium')).toBe('Fair');
      expect(mapOverallConfidence('low')).toBe('Rough');
    });

    test('item labels: Likely / Possible / Uncertain', () => {
      expect(mapItemConfidence('high')).toBe('Likely');
      expect(mapItemConfidence('medium')).toBe('Possible');
      expect(mapItemConfidence('low')).toBe('Uncertain');
    });

    test('tone maps to success / warning / error', () => {
      expect(confidenceTone('high')).toBe('success');
      expect(confidenceTone('medium')).toBe('warning');
      expect(confidenceTone('low')).toBe('error');
    });
  });

  describe('mapEstimateError', () => {
    test('AI not configured family invalidates settings and bounces out', () => {
      for (const code of ['NO_AI_CONFIGURED', 'PROVIDER_NOT_GOOGLE', 'API_KEY_MISSING'] as const) {
        const copy = mapEstimateError(code);
        expect(copy.invalidateAiSettings).toBe(true);
        expect(copy.stayOnForm).toBe(false);
        expect(copy.title.toLowerCase()).toContain('ai');
      }
    });

    test('IMAGE_TOO_LARGE asks for retake (does not stay on form)', () => {
      const copy = mapEstimateError('IMAGE_TOO_LARGE');
      expect(copy.stayOnForm).toBe(false);
      expect(copy.invalidateAiSettings).toBe(false);
      expect(copy.message.toLowerCase()).toContain('retake');
    });

    test('CONTENT_BLOCKED stays on form so user keeps typed context', () => {
      const copy = mapEstimateError('CONTENT_BLOCKED');
      expect(copy.stayOnForm).toBe(true);
      expect(copy.invalidateAiSettings).toBe(false);
    });

    test('UPSTREAM_ERROR and PARSE_ERROR stay on form for retry', () => {
      for (const code of ['UPSTREAM_ERROR', 'PARSE_ERROR'] as const) {
        const copy = mapEstimateError(code);
        expect(copy.stayOnForm).toBe(true);
      }
    });
  });
});
