import {
  overallConfidenceLabels,
  itemConfidenceLabels,
  confidenceTones,
  mapEstimateError,
} from '../../src/utils/foodPhotoEstimate';

describe('foodPhotoEstimate', () => {
  describe('confidence mapping', () => {
    test('overall labels: Good / Fair / Rough', () => {
      expect(overallConfidenceLabels.high).toBe('Good');
      expect(overallConfidenceLabels.medium).toBe('Fair');
      expect(overallConfidenceLabels.low).toBe('Rough');
    });

    test('item labels: Likely / Possible / Uncertain', () => {
      expect(itemConfidenceLabels.high).toBe('Likely');
      expect(itemConfidenceLabels.medium).toBe('Possible');
      expect(itemConfidenceLabels.low).toBe('Uncertain');
    });

    test('tone maps to success / warning / error', () => {
      expect(confidenceTones.high).toBe('success');
      expect(confidenceTones.medium).toBe('warning');
      expect(confidenceTones.low).toBe('error');
    });
  });

  describe('mapEstimateError', () => {
    test('AI not configured family invalidates settings and bounces out', () => {
      for (const code of ['NO_AI_CONFIGURED', 'UNSUPPORTED_PROVIDER', 'API_KEY_MISSING'] as const) {
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

    test('TIMEOUT has its own copy and stays on form for retry', () => {
      const copy = mapEstimateError('TIMEOUT');
      expect(copy.stayOnForm).toBe(true);
      expect(copy.invalidateAiSettings).toBe(false);
      expect(copy.title.toLowerCase()).toContain('timed out');
      expect(copy.message.toLowerCase()).toContain('too long');
    });
  });
});
