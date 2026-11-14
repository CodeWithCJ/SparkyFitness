import { useTranslation } from 'react-i18next';
import type { ChallengeRules } from '@workspace/shared';
import { pointsExample, ruleLines, type MetricUnits } from './challengeCopy';

/**
 * The rules in plain words, with a worked example scored by the shared
 * scorer, the same code the server and the mobile app use.
 */
const HowPointsWork = ({
  rules,
  units,
}: {
  rules: ChallengeRules;
  units: MetricUnits;
}) => {
  const { t } = useTranslation();
  const lines = ruleLines(t, rules, units);
  const example = pointsExample(rules);
  return (
    <div className="space-y-3" data-testid="how-points-work">
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {lines.map((line) => (
          <li key={line.key}>{line.text}</li>
        ))}
      </ul>
      {example && (
        <div className="rounded-md bg-muted p-3 text-sm">
          <p className="font-medium">
            {t('challenges.how.exampleTitle', 'Example day')}
          </p>
          <p>
            {t(
              'challenges.how.example',
              'A {{minutes}}-minute workout in zone {{zone}} earns {{effort}}, and {{steps}} steps add {{stepPoints}}: {{total}} points.',
              {
                minutes: example.workoutMinutes,
                zone: example.zone,
                effort: example.effort,
                steps: example.steps.toLocaleString(),
                stepPoints: example.stepPoints,
                total: example.total,
              }
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default HowPointsWork;
