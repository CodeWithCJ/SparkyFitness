import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  leadsChallenge,
  standingProgress,
  type ChallengeRules,
  type ChallengeStandingsResponse,
} from '@workspace/shared';
import Icon from '../Icon';
import { formatLocalizedNumber, useAppLocale } from '../../localization';
import { formatShortDate } from '../../utils/dateUtils';
import {
  formatChallengeValue,
  showsTrophy,
  type ChallengeUnits,
} from '../../utils/challenges';

type StandingRow = ChallengeStandingsResponse['rows'][number];

// Gold, silver and bronze for places 1 to 3.
const PLACE_BLOCKS = [
  'bg-amber-400 h-20',
  'bg-slate-300 h-14',
  'bg-orange-400 h-10',
];

/** The first letter of a display name (a whole character, emoji included). */
const initialOf = (name: string) =>
  (Array.from(name.trim())[0] ?? '?').toUpperCase();

const Initial: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <View
    className="items-center justify-center rounded-full bg-raised"
    style={{ width: size, height: size }}
  >
    <Text className="text-sm font-semibold text-text-secondary">
      {initialOf(name)}
    </Text>
  </View>
);

/**
 * The first three places with points: second, first, third. Hidden from
 * screen readers, since the list below reads the same names.
 */
const Podium: React.FC<{
  standings: ChallengeStandingsResponse;
  value: (n: number) => string;
  crownColor: string;
}> = ({ standings, value, crownColor }) => {
  const top = standings.rows.filter((row) => row.total > 0).slice(0, 3);
  if (top.length === 0) return null;
  const slots: (StandingRow | undefined)[] = [top[1], top[0], top[2]];
  return (
    <View
      testID="challenge-podium"
      className="flex-row items-end justify-center gap-2 pb-3"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {slots.map((row, i) => {
        if (!row) return <View key={i} className="w-24" />;
        const place = Math.min(row.rank, 3) - 1;
        const crowned = standings.final ? row.winner : leadsChallenge(row);
        return (
          <View key={row.user_id} className="w-24 items-center">
            {crowned ? (
              <Icon name="trophy" size={16} color={crownColor} />
            ) : null}
            <Initial name={row.display_name} size={i === 1 ? 44 : 36} />
            <Text
              className="mt-1 text-sm font-semibold text-text-primary"
              numberOfLines={1}
            >
              {row.display_name}
            </Text>
            <Text className="text-xs text-text-muted">{value(row.total)}</Text>
            <View
              className={`mt-1 w-full items-center justify-center rounded-t-lg ${PLACE_BLOCKS[place]}`}
            >
              <Text className="text-lg font-bold text-black">{row.rank}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

interface ChallengeStandingsListProps {
  standings: ChallengeStandingsResponse;
  rules: ChallengeRules;
  units: ChallengeUnits;
}

/**
 * One period's ranking: place, display name and total. The user's row (`me`)
 * is marked; a trophy only once the period is final.
 */
const ChallengeStandingsList: React.FC<ChallengeStandingsListProps> = ({
  standings,
  rules,
  units,
}) => {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];

  if (standings.rows.length === 0) {
    return (
      <Text className="text-sm text-text-secondary py-4 text-center">
        {t('challenges.standings.empty', {
          defaultValue: 'Nobody has scored in this period yet.',
        })}
      </Text>
    );
  }

  const value = (n: number) => formatChallengeValue(n, rules.metric, units, t);
  const topTotal = standings.rows[0]?.total ?? 0;

  return (
    <View>
      {rules.format !== 'group_goal' ? (
        <Podium
          standings={standings}
          value={value}
          crownColor={accentPrimary}
        />
      ) : null}
      {standings.rows.map((row, index) => {
        const progress = standingProgress(rules, row, topTotal);
        const isMe = row.me === true;
        const detail =
          rules.format === 'hit_goal' &&
          rules.targetPer === 'day' &&
          row.days_eligible !== undefined
            ? t('challenges.standings.daysHit', {
                defaultValue: '{{hit}} of {{eligible}} days on goal',
                hit: row.days_hit ?? 0,
                eligible: row.days_eligible,
              })
            : rules.format === 'race' && row.reached_on
              ? t('challenges.standings.finished', {
                  defaultValue: 'Finished {{date}}',
                  date: formatShortDate(row.reached_on, locale),
                })
              : rules.metric === 'points'
                ? t('challenges.standings.minutes', {
                    defaultValue: '{{value}} active min',
                    value: formatLocalizedNumber(Math.round(row.minutes)),
                  })
                : null;
        return (
          <View
            key={row.user_id}
            testID={`challenge-standing-${row.user_id}`}
            className={`flex-row items-center py-3 ${
              index > 0 ? 'border-t border-border-subtle' : ''
            } ${isMe ? 'bg-accent-primary/10 -mx-4 px-4' : ''}`}
            accessible
            accessibilityLabel={t('challenges.standings.rowA11y', {
              defaultValue: '{{rank}}. {{name}}, {{total}}',
              rank: row.rank,
              name: row.display_name,
              total: formatChallengeValue(row.total, rules.metric, units, t),
            })}
          >
            <Text className="w-8 text-base font-bold text-text-secondary">
              {row.rank}
            </Text>
            <View className="mr-3">
              <Initial name={row.display_name} size={32} />
            </View>
            <View className="flex-1 mr-3">
              <Text
                className="text-base font-semibold text-text-primary"
                numberOfLines={1}
              >
                {isMe
                  ? t('challenges.standings.you', {
                      defaultValue: '{{name}} (you)',
                      name: row.display_name,
                    })
                  : row.display_name}
              </Text>
              {detail ? (
                <Text className="text-xs text-text-muted mt-0.5">{detail}</Text>
              ) : null}
              {progress ? (
                <View className="mt-1.5 h-1.5 rounded-full bg-border-subtle overflow-hidden">
                  <View
                    testID={`challenge-progress-${row.user_id}`}
                    className="h-full rounded-full bg-accent-primary"
                    style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                  />
                </View>
              ) : null}
            </View>
            {showsTrophy(standings, row) ? (
              <View className="mr-2">
                <Icon name="trophy" size={16} color={accentPrimary} />
              </View>
            ) : null}
            <Text className="text-base font-semibold text-text-primary">
              {formatChallengeValue(row.total, rules.metric, units, t)}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default ChallengeStandingsList;
