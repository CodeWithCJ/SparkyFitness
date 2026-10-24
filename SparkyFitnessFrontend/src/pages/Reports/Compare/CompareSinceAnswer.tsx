import { useTranslation } from 'react-i18next';
import type { CompareSinceResponse } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { CompareHowSure } from './CompareHowSure';
import { compareValueText } from './compareCopy';
import {
  sinceAlreadyChangingLine,
  sinceCaveat,
  sinceHowSureLines,
  sinceRegularityLine,
  sinceStretchRows,
  sinceVerdictCopy,
} from './compareSinceCopy';

interface CompareSinceAnswerProps {
  response: CompareSinceResponse;
}

const CELL = 'py-1.5 pr-3 align-top';

const StretchTable = ({ response }: CompareSinceAnswerProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, timeFormat } = usePreferences();
  const rows = sinceStretchRows(
    response,
    t,
    (d) => formatDateInUserTimezone(d, 'PP'),
    timeFormat
  );
  if (rows.length === 0) return null;

  const showUsual = rows.some((row) => row.usual !== null);
  const showLine = rows.some((row) => row.atOrAbove !== null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {t('compareReport.since.table.title', {
            defaultValue: 'Before and since',
          })}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className={CELL}>
                <span className="sr-only">
                  {t('compareReport.since.table.stretch', {
                    defaultValue: 'Stretch',
                  })}
                </span>
              </th>
              <th className={CELL}>
                {t('compareReport.since.table.dates', {
                  defaultValue: 'Dates',
                })}
              </th>
              <th className={CELL}>
                {t('compareReport.since.table.days', {
                  defaultValue: 'Days with a value',
                })}
              </th>
              <th className={CELL}>
                {t('compareReport.since.table.average', {
                  defaultValue: 'Average',
                })}
              </th>
              {showUsual && (
                <th className={CELL}>
                  {t('compareReport.since.table.usual', {
                    defaultValue: 'Usually between',
                  })}
                </th>
              )}
              {showLine && (
                <th className={CELL}>
                  {t('compareReport.since.table.atOrAbove', {
                    defaultValue: 'At or above {{line}}',
                    line: compareValueText(
                      response.outcome.key,
                      response.result.line,
                      timeFormat
                    ),
                  })}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.side} className="border-t">
                <th scope="row" className={CELL + ' font-medium'}>
                  {row.label}
                </th>
                <td className={CELL}>{row.dates}</td>
                <td className={CELL}>{row.valueDays}</td>
                <td className={CELL}>{row.average}</td>
                {showUsual && <td className={CELL}>{row.usual ?? ''}</td>}
                {showLine && <td className={CELL}>{row.atOrAbove ?? ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

/**
 * The left column of a since answer: the verdict and the caveat (always), then,
 * once there is an answer, the before-and-since table, the kept-up line and how
 * sure. One element, so it fills one cell of the page's two-column grid.
 */
export const CompareSinceAnswer = ({ response }: CompareSinceAnswerProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, timeFormat } = usePreferences();
  const { headline, detail } = sinceVerdictCopy(
    response,
    t,
    (d) => formatDateInUserTimezone(d, 'PP'),
    timeFormat
  );
  const alreadyChanging = sinceAlreadyChangingLine(response, t);
  const caveat = sinceCaveat(
    { a: response.habit.key, b: response.outcome.key },
    t
  );
  const ok = response.result.status === 'ok';
  const regularity = ok ? sinceRegularityLine(response.result, t) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-2xl font-bold">{headline}</h2>
          {detail && (
            <p className="mt-2 text-base text-muted-foreground">{detail}</p>
          )}
          {alreadyChanging && (
            <p className="mt-3 text-sm text-muted-foreground">
              {alreadyChanging}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{caveat}</p>
        </CardContent>
      </Card>
      {ok && (
        <>
          <StretchTable response={response} />
          {regularity && (
            <p className="text-sm text-muted-foreground">{regularity}</p>
          )}
          <CompareHowSure lines={sinceHowSureLines(response, t)} />
        </>
      )}
    </div>
  );
};
