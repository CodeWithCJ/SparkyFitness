import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('dashboard localization contract', () => {
  it('keeps the dashboard shell and empty states Arabic', () => {
    const source = read('src/screens/DashboardScreen.tsx');

    for (const key of [
      'dashboard.loading',
      'dashboard.askSparky',
      'dashboard.macronutrients',
      'dashboard.healthTrends',
    ]) {
      expect(source).toContain(`mobileT('${key}')`);
    }

    for (const englishCopy of [
      'Loading summary...',
      'Failed to load summary',
      'Macronutrients',
      'Tap to add food',
      'Health Trends',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });

  it('keeps core dashboard cards Arabic and RTL-aware', () => {
    const sources = [
      'src/components/CalorieRingCard.tsx',
      'src/components/MacroCard.tsx',
      'src/components/ExerciseProgressCard.tsx',
      'src/components/HydrationGauge.tsx',
    ]
      .map(read)
      .join('\n');

    expect(sources).toContain("mobileT('dashboard.consumed')");
    expect(sources).toContain("mobileT('dashboard.hydration')");
    expect(sources).toContain('isMobileRtl');

    for (const englishCopy of [
      'label="Consumed"',
      '>remaining<',
      'No exercise entries yet',
      'Configure water container on server',
    ]) {
      expect(sources).not.toContain(englishCopy);
    }
  });

  it('keeps health trend charts Arabic', () => {
    const sources = [
      'src/components/StepsBarChart.tsx',
      'src/components/WeightLineChart.tsx',
    ]
      .map(read)
      .join('\n');

    expect(sources).toContain("mobileT('charts.steps')");
    expect(sources).toContain("mobileT('charts.weight')");
    expect(sources).toContain('formatMobileNumber');

    for (const englishCopy of [
      'Press a bar for details',
      'Failed to load step data',
      'Press the line for details',
      'Failed to load weight data',
    ]) {
      expect(sources).not.toContain(englishCopy);
    }
  });
});
