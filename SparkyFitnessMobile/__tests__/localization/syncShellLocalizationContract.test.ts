import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const source = [
  readSource('src/screens/SyncScreen.tsx'),
  readSource('src/components/SyncFrequency.tsx'),
  readSource('src/components/SyncOnOpen.tsx'),
  readSource('src/components/HealthSourceLabel.tsx'),
  readSource('src/hooks/useSyncHealthData.ts'),
].join('\n');

describe('health sync shell localization contract', () => {
  it('localizes sync actions, status, permissions, and safety guidance', () => {
    for (const key of [
      'screens.sync',
      'sync.rangeTitle',
      'sync.now',
      'sync.backgroundTitle',
      'sync.onOpenTitle',
      'sync.permissionDenied',
      'sync.complete',
      'sync.failed',
      'sync.medicalDisclaimerTitle',
      'sync.reportPrivacy',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('uses the reviewed Arabic health metric dictionary in permission prompts', () => {
    expect(source).toContain('localizeHealthMetricLabel(metric.id, metric.label)');
  });

  it('does not show raw English sync or permission errors', () => {
    for (const englishCopy of [
      '>Sync Range<',
      '>Sync Now<',
      'Send your health data to your server',
      "Alert.alert('Permission Denied'",
      "Alert.alert('Permission Error'",
      'Not medical advice.',
      '>Health Data Report<',
      "text1: 'Sync Error'",
      'text2: error.message',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
