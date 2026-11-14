import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import type {
  ChallengeRules,
  ChallengeStandingsResponse,
} from '@workspace/shared';
import Icon from '../Icon';
import { formatLocalizedNumber, useAppLocale } from '../../localization';
import { formatShortDate } from '../../utils/dateUtils';
import {
  formatChallengeValue,
  showsTrophy,
  type ChallengeUnits,
} from '../../utils/challenges';

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

  return (
    <View>
      {standings.rows.map((row, index) => {
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
