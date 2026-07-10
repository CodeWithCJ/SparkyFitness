import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/LogScreen.tsx'),
  'utf8',
);

describe('log screen localization contract', () => {
  it('localizes the header, filters, alerts, toasts, and empty states', () => {
    for (const key of [
      'screens.logs',
      'logs.level.error',
      'logs.clearTitle',
      'logs.filterSaveFailed',
      'logs.copied',
      'logs.empty',
      'logs.noMatches',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes counts and timestamps and uses semantic RTL spacing', () => {
    expect(source).toContain('formatMobileLogCount(filteredLogs.length)');
    expect(source).toContain('formatMobileNumber(count)');
    expect(source).toContain('formatDateTime(new Date(item.timestamp))');
    expect(source).toContain('me-2');
    expect(source).toContain('me-3');
  });

  it('does not leave visible English screen chrome behind', () => {
    for (const englishCopy of [
      "title: 'Logs'",
      "label: 'Clear'",
      'Clear Logs',
      'Failed to save log filter.',
      'Log entry copied to clipboard',
      'No logs yet.',
      'No logs match the current filter.',
      'Showing ${n}',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
