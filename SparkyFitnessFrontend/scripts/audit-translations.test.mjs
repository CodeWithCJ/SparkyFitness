import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTranslationCatalogs } from './audit-translations.mjs';

test('reports missing, extra, and interpolation-mismatched messages', () => {
  const source = {
    common: {
      greeting: 'Hello {{name}}',
      save: 'Save',
    },
  };
  const target = {
    common: {
      greeting: 'هلا {{user}}',
      cancel: 'إلغاء',
    },
  };

  assert.deepEqual(compareTranslationCatalogs(source, target), {
    sourceMessageCount: 2,
    targetMessageCount: 2,
    translatedMessageCount: 1,
    coveragePercent: 50,
    missingKeys: ['common.save'],
    extraKeys: ['common.cancel'],
    interpolationMismatches: [
      {
        key: 'common.greeting',
        sourceVariables: ['name'],
        targetVariables: ['user'],
      },
    ],
  });
});

test('accepts a complete catalog with reordered interpolation variables', () => {
  const source = {
    summary: '{{name}} logged {{count}} meals',
  };
  const target = {
    summary: 'سجّل {{count}} وجبات يا {{name}}',
  };

  assert.deepEqual(compareTranslationCatalogs(source, target), {
    sourceMessageCount: 1,
    targetMessageCount: 1,
    translatedMessageCount: 1,
    coveragePercent: 100,
    missingKeys: [],
    extraKeys: [],
    interpolationMismatches: [],
  });
});
