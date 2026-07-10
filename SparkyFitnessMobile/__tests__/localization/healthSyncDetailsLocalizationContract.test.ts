import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const source = [
  readSource('src/components/HealthDataSync.tsx'),
  readSource('src/components/HealthDataWriteback.tsx'),
  readSource('src/components/DateRangeSheet.tsx'),
  readSource('src/components/CollapsibleSection.tsx'),
  readSource('src/services/healthDataDisplay.ts'),
].join('\n');

describe('health sync details localization contract', () => {
  it('localizes metric cards, categories, writeback, and date-range removal', () => {
    for (const key of [
      'healthSync.dataTitle',
      'healthSync.enableAll',
      'healthSync.metricAccessibility',
      'healthWriteback.title',
      'healthWriteback.removeAction',
      'healthWriteback.rangeTitle',
      'section.collapse',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes metric names, categories, values, counts, and calendar locale', () => {
    expect(source).toContain('localizeHealthMetricLabel(metric.id, metric.label)');
    expect(source).toContain('localizeHealthCategory(category)');
    expect(source).toContain('formatMobileHealthRecordCount(records.length)');
    expect(source).toContain('formatMobileNumber');
    expect(source).toContain('locale={MOBILE_LOCALE}');
  });

  it('keeps visible details free of English placeholders and units', () => {
    for (const englishCopy of [
      '>Health Data to Sync<',
      'Enable All Health Metrics',
      'Not medical advice.',
      'Write to {storeName}',
      'Remove selected range',
      "export const NO_DATA_DISPLAY = 'No data'",
      "result[metric.id] = 'Error'",
      "`${records.length} record",
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
