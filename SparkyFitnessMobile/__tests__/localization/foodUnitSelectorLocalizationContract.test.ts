import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/components/FoodUnitSelectorSheet.tsx'),
  'utf8',
);

describe('food unit selector localization contract', () => {
  it('localizes unit groups, standard units, and AI confidence', () => {
    expect(source).toContain('localizeServingUnit(');
    expect(source).toContain('`foodUnit.group.${');
    expect(source).toContain('`foodUnit.confidence.${');
    expect(source).toContain("mobileT('foodUnit.aiEstimateConfidence'");
    expect(source).not.toContain('OVERALL_CONFIDENCE_LABELS');
  });

  it('keeps selector headings and recovery copy Arabic', () => {
    expect(source).toContain("title = mobileT('foodUnit.selectUnit')");
    expect(source).toContain("mobileT('foodUnit.savedCustomUnits')");
    expect(source).toContain("mobileT('foodUnit.updateFailed')");
    expect(source).not.toContain('Saved Custom Units');
    expect(source).not.toContain('Could not update that unit');
    expect(source).not.toContain('Please try again.');
  });
});
