import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  CHALLENGE_FIND_FROM_ROWS,
  challengeDisplayNameSchema,
  filterStandingsByName,
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

// No display name is longer, so a longer query can match nothing.
const FIND_MAX_LENGTH = challengeDisplayNameSchema.maxLength ?? 40;

// Block heights for places 1 to 3; their gold, silver and bronze are the
// theme's category tokens (JS only), read in the list.
const PLACE_HEIGHTS = ['h-20', 'h-14', 'h-10'];

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
  placeColors: readonly [string, string, string];
}> = ({ standings, value, crownColor, placeColors }) => {
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
              className={`mt-1 w-full items-center justify-center overflow-hidden rounded-t-lg ${PLACE_HEIGHTS[place]}`}
            >
              {/* A tint of the place colour, so the rank in the theme's text
                  colour reads in light and dark themes alike. */}
              <View
                className="absolute inset-0"
                style={{ backgroundColor: placeColors[place], opacity: 0.45 }}
              />
              <Text className="text-lg font-bold text-text-primary">
                {row.rank}
              </Text>
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
  const [accentPrimary, textMuted, gold, silver, bronze] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-cat-amber',
    '--color-cat-slate',
    '--color-cat-orange',
  ]) as [string, string, string, string, string];
  const [search, setSearch] = useState('');

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
  const rows = filterStandingsByName(standings.rows, search);

  return (
    <View>
      {rules.format !== 'group_goal' ? (
        <Podium
          standings={standings}
          value={value}
          crownColor={accentPrimary}
          placeColors={[gold, silver, bronze]}
        />
      ) : null}
      {/* Kept while a search is on, even if a refresh drops below the
          threshold, so the filter can always be cleared. */}
      {standings.rows.length >= CHALLENGE_FIND_FROM_ROWS || search !== '' ? (
        <View className="flex-row items-center rounded-lg border border-border-subtle px-3 py-2 mb-1">
          <Icon name="search" size={16} color={textMuted} />
          <TextInput
            testID="challenge-standings-find"
            className="flex-1 ml-2 text-text-primary"
            style={{ fontSize: 15, padding: 0, includeFontPadding: false }}
            value={search}
            onChangeText={setSearch}
            maxLength={FIND_MAX_LENGTH}
            placeholder={t('challenges.standings.find', {
              defaultValue: 'Find a member',
            })}
            placeholderTextColor={textMuted}
            accessibilityLabel={t('challenges.standings.find', {
              defaultValue: 'Find a member',
            })}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}
      {rows.length === 0 ? (
        <Text className="text-sm text-text-secondary py-4 text-center">
          {t('challenges.standings.noMatch', {
            defaultValue: 'No member matches “{{query}}”.',
            query: search.trim(),
          })}
        </Text>
      ) : null}
      {rows.map((row, index) => {
        const progress = standingProgress(rules, row, topTotal);
        const isMe = row.me === true;
        const shownName = isMe
          ? t('challenges.standings.you', {
              defaultValue: '{{name}} (you)',
              name: row.display_name,
            })
          : row.display_name;
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
            accessibilityLabel={[
              t('challenges.standings.rowA11y', {
                defaultValue: '{{rank}}. {{name}}, {{total}}',
                rank: row.rank,
                name: shownName,
                total: formatChallengeValue(row.total, rules.metric, units, t),
              }),
              detail,
              showsTrophy(standings, row)
                ? t('challenges.standings.winner', { defaultValue: 'Winner' })
                : null,
            ]
              .filter(Boolean)
              .join(', ')}
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
                {shownName}
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
