import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNutritionReport } from '../hooks/useNutritionReport';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import { NUTRIENT_META, getNutrientLabel } from '../constants/nutrients';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportInsights from '../components/reports/ReportInsights';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import ReportHighlights, {
  type ReportHighlight,
} from '../components/reports/ReportHighlights';
import { useReportCustomization } from '../hooks/useReportCustomization';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useServerConnection } from '../hooks/useServerConnection';
import {
  FAT_BREAKDOWN_NUTRIENTS,
  MICRONUTRIENTS,
  REPORT_NUTRIENT_KEYS,
} from '../constants/reports';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { resolveKeyOrder } from '../utils/reorderUtils';
import MacroSplitBar from '../components/reports/MacroSplitBar';
import CaloriesBarChart from '../components/CaloriesBarChart';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import { average } from '../utils/mathUtils';
import {
  buildNutrientAverages,
  percentChange,
  type NutrientAverage,
} from '../utils/nutritionReport';
import type { RootStackScreenProps } from '../types/navigation';

type NutritionReportScreenProps = RootStackScreenProps<'NutritionReport'>;

const NutritionReportScreen: React.FC<NutritionReportScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const {
    window: reportWindow,
    rangeProps,
    isSectionShown,
  } = useReportCustomization();
  const { report, isLoading, isError } = useNutritionReport({
    window: reportWindow,
  });
  const days = reportWindow.days;

  const header = useScreenHeader({
    title: t('nutritionReport.title', { defaultValue: 'Nutrition' }),
    left: { kind: 'back' },
  });

  const fmt = (value: number, digits = 0) =>
    formatLocalizedNumber(value, { maximumFractionDigits: digits });
  const kcal = (value: number) =>
    t('nutritionReport.kcal', {
      defaultValue: '{{value}} kcal',
      value: fmt(Math.round(value)),
    });
  const grams = (value: number) =>
    t('nutritionReport.grams', {
      defaultValue: '{{value}} g',
      value: fmt(Math.round(value)),
    });

  const insights = report?.insights ?? null;
  const averageCalories = useMemo(
    () => average(report?.series.map((point) => point.calories) ?? []),
    [report]
  );

  const { isConnected } = useServerConnection();
  const { customNutrients } = useCustomNutrients({ enabled: isConnected });
  const shownReportNutrients = useAppPreferencesStore(
    (s) => s.shownReportNutrients
  );
  const reportNutrientOrder = useAppPreferencesStore(
    (s) => s.reportNutrientOrder
  );
  const pickedKeys = useMemo(
    () =>
      resolveKeyOrder(reportNutrientOrder, [
        ...REPORT_NUTRIENT_KEYS,
        ...customNutrients.map((def) => def.name),
      ]).filter((key) => shownReportNutrients.includes(key)),
    [reportNutrientOrder, shownReportNutrients, customNutrients]
  );
  const averagesFor = (keys: readonly string[]): NutrientAverage[] =>
    report
      ? buildNutrientAverages(
          report.points,
          report.previousPoints,
          report.dayGoalSets,
          keys
        )
      : [];
  const nutrientRows = (items: NutrientAverage[]) =>
    items.map((item) => {
      const custom = customNutrients.find((def) => def.name === item.key);
      const unit = custom?.unit ?? NUTRIENT_META[item.key]?.unit ?? '';
      const label = custom ? item.key : getNutrientLabel(t, item.key);
      const hints = [
        item.goalPct === null
          ? null
          : t('nutritionReport.nutrientGoalHint', {
              defaultValue: '{{pct}}% of goal',
              pct: fmt(item.goalPct),
            }),
        item.change === null || item.change === 0
          ? null
          : t('nutritionReport.nutrientChangeHint', {
              defaultValue: '{{change}} vs previous',
              change: `${item.change > 0 ? '+' : ''}${fmt(item.change)}%`,
            }),
      ].filter(Boolean);
      return {
        label,
        value: `${fmt(item.average, item.average < 10 ? 1 : 0)} ${unit}`.trim(),
        hint: hints.length > 0 ? hints.join(' · ') : undefined,
        testID: `nutrition-nutrient-${item.key}`,
        onPress: () =>
          navigation.navigate('NutrientTrends', {
            nutrientKey: item.key,
            nutrientLabel: label,
            unit,
            goal: item.goal ?? undefined,
          }),
      };
    });

  const renderNutrientCard = (title: string, items: NutrientAverage[]) =>
    items.length > 0 ? (
      <ReportSummaryCard title={title} rows={nutrientRows(items)} />
    ) : null;

  if (isLoading || isError) {
    return (
      <ReportScreenLayout header={header} {...rangeProps}>
        <StatusView
          loading={isLoading}
          icon="chart-bar"
          iconTone="muted"
          inline
          title={
            isError
              ? t('nutritionReport.loadFailed', {
                  defaultValue: 'Failed to load nutrition data',
                })
              : undefined
          }
        />
      </ReportScreenLayout>
    );
  }

  const change = percentChange(
    insights?.averages?.calories ?? null,
    insights?.previousAverageCalories ?? null
  );
  const changeHint =
    change === null
      ? undefined
      : t('nutritionReport.changeHint', {
          defaultValue: '{{change}} vs previous {{days}} days',
          change: `${change > 0 ? '+' : ''}${formatLocalizedNumber(change)}%`,
          days,
        });

  const weekdayName = (weekday: number) =>
    // 2000-01-02 was a Sunday, so day 2 + weekday lands on that weekday.
    new Date(2000, 0, 2 + weekday).toLocaleDateString(getAppLocale(), {
      weekday: 'long',
    });

  const goal = insights?.goal;
  const goalRows =
    goal && goal.daysWithGoal > 0
      ? [
          {
            label: t('nutritionReport.onTarget', {
              defaultValue: 'Within 10% of goal',
            }),
            value: t('nutritionReport.daysOfLogged', {
              defaultValue: '{{onTarget}} of {{total}} days',
              onTarget: goal.onTarget,
              total: goal.daysWithGoal,
            }),
            testID: 'nutrition-goal-on-target',
          },
          {
            label: t('nutritionReport.overGoal', {
              defaultValue: 'Over goal',
            }),
            value: t('nutritionReport.daysCount', {
              defaultValue: '{{count}} days',
              count: goal.over,
            }),
            testID: 'nutrition-goal-over',
          },
          {
            label: t('nutritionReport.underGoal', {
              defaultValue: 'Under goal',
            }),
            value: t('nutritionReport.daysCount', {
              defaultValue: '{{count}} days',
              count: goal.under,
            }),
            testID: 'nutrition-goal-under',
          },
          {
            label: t('nutritionReport.averageVsGoal', {
              defaultValue: 'Average vs goal',
            }),
            value: `${(goal.averageDifference ?? 0) > 0 ? '+' : ''}${kcal(
              goal.averageDifference ?? 0
            )}`,
            testID: 'nutrition-goal-difference',
          },
        ]
      : [];

  const dayRow = (
    label: string,
    extreme: { day: string; calories: number } | null,
    testID: string
  ) =>
    extreme
      ? [
          {
            label,
            value: kcal(extreme.calories),
            hint: formatTooltipDate(extreme.day),
            testID,
          },
        ]
      : [];

  const insightLines: string[] = [];
  if (insights && insights.loggedDays > 0) {
    const protein = insights.macroGoals.find((m) => m.key === 'protein');
    if (protein) {
      insightLines.push(
        t('nutritionReport.insightProtein', {
          defaultValue: 'You averaged {{pct}}% of your protein goal.',
          pct: fmt(protein.pct),
        })
      );
    }
    if (goal && goal.daysWithGoal > 0) {
      insightLines.push(
        t('nutritionReport.insightOnTarget', {
          defaultValue:
            '{{onTarget}} of {{total}} logged days were within 10% of your calorie goal.',
          onTarget: goal.onTarget,
          total: goal.daysWithGoal,
        })
      );
    }
    if (change !== null && Math.abs(change) >= 5) {
      insightLines.push(
        change > 0
          ? t('nutritionReport.insightUp', {
              defaultValue:
                'Your average calories are up {{pct}}% on the previous period.',
              pct: fmt(change),
            })
          : t('nutritionReport.insightDown', {
              defaultValue:
                'Your average calories are down {{pct}}% on the previous period.',
              pct: fmt(Math.abs(change)),
            })
      );
    }
    if (insights.weekdayCalories.length >= 3) {
      const top = insights.weekdayCalories.reduce((a, b) =>
        b.average > a.average ? b : a
      );
      insightLines.push(
        t('nutritionReport.insightWeekday', {
          defaultValue:
            '{{weekday}} is your highest-calorie day, averaging {{kcal}}.',
          weekday: weekdayName(top.weekday),
          kcal: kcal(top.average),
        })
      );
    }
    if (insights.streaks.longest >= 3) {
      insightLines.push(
        t('nutritionReport.insightStreak', {
          defaultValue: 'Your longest logging streak was {{count}} days.',
          count: insights.streaks.longest,
        })
      );
    }
  }

  const signedPercent = (value: number) =>
    `${value > 0 ? '+' : ''}${formatLocalizedNumber(value)}%`;
  const highlights: ReportHighlight[] =
    insights && insights.loggedDays > 0 && insights.averages
      ? [
          {
            label: t('nutritionReport.avgCalories', {
              defaultValue: 'Avg calories',
            }),
            value: kcal(insights.averages.calories),
            change: change === null ? undefined : signedPercent(change),
            changeTone: 'neutral',
            testID: 'nutrition-highlight-calories',
          },
          {
            label: t('nutritionReport.avgProtein', {
              defaultValue: 'Avg protein',
            }),
            value: grams(insights.averages.protein),
            testID: 'nutrition-highlight-protein',
          },
          ...(goal && goal.daysWithGoal > 0
            ? [
                {
                  label: t('nutritionReport.onTargetShort', {
                    defaultValue: 'Days on target',
                  }),
                  value: t('nutritionReport.onTargetValue', {
                    defaultValue: '{{onTarget}}/{{total}}',
                    onTarget: goal.onTarget,
                    total: goal.daysWithGoal,
                  }),
                  testID: 'nutrition-highlight-on-target',
                },
              ]
            : []),
          {
            label: t('nutritionReport.daysLogged', {
              defaultValue: 'Days logged',
            }),
            value: t('nutritionReport.daysOfWindow', {
              defaultValue: '{{logged}} of {{total}}',
              logged: insights.loggedDays,
              total: days,
            }),
            testID: 'nutrition-highlight-days',
          },
        ]
      : [];

  return (
    <ReportScreenLayout header={header} {...rangeProps}>
      {isSectionShown('nutrition.overview') ? (
        <ReportHighlights items={highlights} />
      ) : null}
      {isSectionShown('nutrition.insights') ? (
        <ReportInsights lines={insightLines} testIDPrefix="nutrition" />
      ) : null}
      {isSectionShown('nutrition.chart') ? (
        <CaloriesBarChart
          data={report?.series ?? []}
          isLoading={false}
          isError={false}
          range={reportWindow.chartRange}
          averageCalories={averageCalories}
          goals={report?.goals}
        />
      ) : null}
      {insights && insights.loggedDays > 0 && insights.averages ? (
        <>
          {isSectionShown('nutrition.averages') ? (
            <ReportSummaryCard
              title={t('nutritionReport.dailyAverages', {
                defaultValue: 'Daily averages',
              })}
              rows={[
                {
                  label: t('nutritionReport.calories', {
                    defaultValue: 'Calories',
                  }),
                  value: kcal(insights.averages.calories),
                  hint: changeHint,
                  testID: 'nutrition-average-calories',
                },
                {
                  label: getNutrientLabel(t, 'protein'),
                  value: grams(insights.averages.protein),
                  testID: 'nutrition-average-protein',
                },
                {
                  label: getNutrientLabel(t, 'carbs'),
                  value: grams(insights.averages.carbs),
                  testID: 'nutrition-average-carbs',
                },
                {
                  label: getNutrientLabel(t, 'fat'),
                  value: grams(insights.averages.fat),
                  testID: 'nutrition-average-fat',
                },
                {
                  label: t('nutritionReport.daysLogged', {
                    defaultValue: 'Days logged',
                  }),
                  value: t('nutritionReport.daysOfWindow', {
                    defaultValue: '{{logged}} of {{total}}',
                    logged: insights.loggedDays,
                    total: days,
                  }),
                  testID: 'nutrition-days-logged',
                },
              ]}
            />
          ) : null}
          {isSectionShown('nutrition.macroSplit') && insights.macroSplit ? (
            <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
              <Text className="text-text-primary text-lg font-semibold mb-3">
                {t('nutritionReport.macroSplit', {
                  defaultValue: 'Where your calories come from',
                })}
              </Text>
              <MacroSplitBar
                split={insights.macroSplit}
                labels={{
                  protein: getNutrientLabel(t, 'protein'),
                  carbs: getNutrientLabel(t, 'carbs'),
                  fat: getNutrientLabel(t, 'fat'),
                }}
              />
            </View>
          ) : null}
          {isSectionShown('nutrition.goal') && goalRows.length > 0 ? (
            <ReportSummaryCard
              title={t('nutritionReport.goalAdherence', {
                defaultValue: 'Calorie goal',
              })}
              rows={goalRows}
            />
          ) : null}
          {isSectionShown('nutrition.highlights') && insights.highest ? (
            <ReportSummaryCard
              title={t('nutritionReport.highlights', {
                defaultValue: 'Highlights',
              })}
              rows={[
                ...dayRow(
                  t('nutritionReport.highestDay', {
                    defaultValue: 'Highest day',
                  }),
                  insights.highest,
                  'nutrition-highest-day'
                ),
                ...dayRow(
                  t('nutritionReport.lowestDay', {
                    defaultValue: 'Lowest logged day',
                  }),
                  insights.lowest,
                  'nutrition-lowest-day'
                ),
              ]}
            />
          ) : null}
          {isSectionShown('nutrition.macroGoals') &&
          insights.macroGoals.length > 0 ? (
            <ReportSummaryCard
              title={t('nutritionReport.macroGoals', {
                defaultValue: 'Macro goals',
              })}
              rows={insights.macroGoals.map((macro) => ({
                label: getNutrientLabel(t, macro.key),
                value: t('nutritionReport.macroGoalValue', {
                  defaultValue: '{{average}} of {{goal}} g',
                  average: fmt(Math.round(macro.average)),
                  goal: fmt(Math.round(macro.goal)),
                }),
                hint: t('nutritionReport.macroGoalHint', {
                  defaultValue: '{{pct}}% of goal on average',
                  pct: fmt(macro.pct),
                }),
                testID: `nutrition-macro-goal-${macro.key}`,
              }))}
            />
          ) : null}
          {isSectionShown('nutrition.weekdays') &&
          insights.weekdayCalories.length > 1 ? (
            <ReportSummaryCard
              title={t('nutritionReport.byWeekday', {
                defaultValue: 'Calories by weekday',
              })}
              rows={insights.weekdayCalories.map(
                ({ weekday, average: avg }) => ({
                  label: weekdayName(weekday),
                  value: kcal(avg),
                  testID: `nutrition-weekday-${weekday}`,
                })
              )}
            />
          ) : null}
          {isSectionShown('nutrition.consistency') ? (
            <ReportSummaryCard
              title={t('nutritionReport.consistency', {
                defaultValue: 'Logging consistency',
              })}
              rows={[
                {
                  label: t('nutritionReport.currentStreak', {
                    defaultValue: 'Current streak',
                  }),
                  value: t('nutritionReport.daysCount', {
                    defaultValue: '{{count}} days',
                    count: insights.streaks.current,
                  }),
                  testID: 'nutrition-streak-current',
                },
                {
                  label: t('nutritionReport.longestStreak', {
                    defaultValue: 'Longest streak',
                  }),
                  value: t('nutritionReport.daysCount', {
                    defaultValue: '{{count}} days',
                    count: insights.streaks.longest,
                  }),
                  testID: 'nutrition-streak-longest',
                },
              ]}
            />
          ) : null}
          {isSectionShown('nutrition.fats')
            ? renderNutrientCard(
                t('nutritionReport.fatBreakdown', {
                  defaultValue: 'Fat breakdown',
                }),
                averagesFor(FAT_BREAKDOWN_NUTRIENTS)
              )
            : null}
          {isSectionShown('nutrition.micros')
            ? renderNutrientCard(
                t('nutritionReport.micronutrients', {
                  defaultValue: 'Vitamins and minerals',
                }),
                averagesFor(MICRONUTRIENTS)
              )
            : null}
          {isSectionShown('nutrition.otherNutrients')
            ? renderNutrientCard(
                t('nutritionReport.yourNutrients', {
                  defaultValue: 'Your nutrients',
                }),
                averagesFor(pickedKeys)
              )
            : null}
          {isSectionShown('nutrition.trends') ? (
            <View className="bg-surface rounded-xl my-2 shadow-sm overflow-hidden">
              <Text className="text-text-primary text-lg font-semibold p-4 pb-2">
                {t('nutritionReport.trendsByNutrient', {
                  defaultValue: 'Trend by nutrient',
                })}
              </Text>
              {(['protein', 'carbs', 'fat'] as const).map((key) => (
                <Pressable
                  key={key}
                  testID={`nutrition-trend-${key}`}
                  className="px-4 py-3 flex-row items-center justify-between border-t border-border-subtle"
                  onPress={() =>
                    navigation.navigate('NutrientTrends', {
                      nutrientKey: key,
                      nutrientLabel: getNutrientLabel(t, key),
                      unit: 'g',
                    })
                  }
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                >
                  <Text className="text-text-primary text-base">
                    {getNutrientLabel(t, key)}
                  </Text>
                  <Icon name="chevron-forward" size={20} color="#999" />
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <StatusView
          icon="chart-bar"
          iconTone="muted"
          inline
          title={t('nutritionReport.empty', {
            defaultValue: 'No food logged in this period',
          })}
        />
      )}
    </ReportScreenLayout>
  );
};

export default NutritionReportScreen;
