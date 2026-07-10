import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('fasting localization contract', () => {
  it('keeps the dashboard fasting card Arabic and RTL-aware', () => {
    const source = read('src/components/FastingCard.tsx');

    expect(source).toContain("mobileT('fasting.title')");
    expect(source).toContain('isMobileRtl');

    for (const englishCopy of [
      'View details',
      'Goal reached',
      'Ready to start',
      'Start Fast',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });

  it('keeps the protocol picker Arabic with Arabic calendar numerals', () => {
    const source = read('src/components/FastingProtocolSheet.tsx');

    expect(source).toContain("mobileT('fasting.startTitle')");
    expect(source).toContain('locale="ar"');
    expect(source).toContain('numerals="arab"');
    expect(source).not.toContain('Start a fast');
    expect(source).not.toContain('Please try again.');
  });

  it('keeps fasting details and ending flow Arabic and RTL-aware', () => {
    const detailSource = read('src/screens/FastingDetailScreen.tsx');
    const endSource = read('src/components/EndFastSheet.tsx');

    expect(detailSource).toContain("mobileT('fasting.metabolicStages')");
    expect(detailSource).toContain('isMobileRtl');
    expect(detailSource).not.toContain('No active fast');
    expect(detailSource).not.toContain('Start a fast to track');

    expect(endSource).toContain("mobileT('fasting.endTitle')");
    expect(endSource).toContain('locale="ar"');
    expect(endSource).toContain('numerals="arab"');
    expect(endSource).not.toContain('Please try again.');
  });
});
