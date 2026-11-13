import { useTranslation } from 'react-i18next';
import type { CompareQuestion, CompareResponse } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { checkLines } from './compareCopy';

interface CompareChecksProps {
  response: CompareResponse;
  question: CompareQuestion;
}

export const CompareChecks = ({ response, question }: CompareChecksProps) => {
  const { t } = useTranslation();
  const lines = checkLines(response.result, question, t);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {t('compareReport.checks.title', 'Checks')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
