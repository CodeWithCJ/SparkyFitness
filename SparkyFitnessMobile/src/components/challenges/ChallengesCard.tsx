import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from '../Icon';
import {
  useChallenges,
  useChallengesStandings,
} from '../../hooks/useChallenges';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';
import { usePreferences } from '../../hooks/usePreferences';
import {
  challengeDaysToGo,
  challengeLeaders,
  challengeStateNow,
  challengesForCard,
  leadsChallenge,
  ownChallengeStanding,
} from '@workspace/shared';
import {
  challengeStateText,
  formatChallengeValue,
  type ChallengeUnits,
} from '../../utils/challenges';
import type { RootStackParamList, TabParamList } from '../../types/navigation';

type ChallengesCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface ChallengesCardProps {
  navigation: ChallengesCardNavigation;
}

/** Most challenges the card lists; the rest are a tap away. */
export const CHALLENGES_CARD_LIMIT = 3;

/**
 * The user's place in each current challenge (`challengesForCard`: running,
 * then upcoming, each judged on today in its own time zone, as on the web).
 * Upcoming ones say when they start. Hidden on a server without Challenges
 * and for anyone with no current challenge.
 */
const ChallengesCard: React.FC<ChallengesCardProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const { challenges } = useChallenges();
  // One clock for the list, the states and the day counts.
  const now = new Date();
  const shown = challengesForCard(challenges, CHALLENGES_CARD_LIMIT, now);
  // Only running challenges have standings; the server's today picks the
  // period, as on the web card.
  const runningIds = shown
    .filter((c) => challengeStateNow(c, now) === 'running')
    .map((c) => c.id);
  const standings = useChallengesStandings(runningIds, null, {
    poll: true,
  });
  const { preferences } = usePreferences({ enabled: shown.length > 0 });
  const energyUnit = useEnergyUnit();
  const units: ChallengeUnits = {
    distanceUnit:
      preferences?.default_distance_unit === 'miles' ? 'miles' : 'km',
    energyUnit,
  };

  if (shown.length === 0) return null;

  return (
    <Pressable
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      onPress={() => navigation.navigate('Challenges')}
      accessibilityRole="button"
      accessibilityLabel={t('challenges.card.a11y', {
        defaultValue: 'Challenges',
      })}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-md font-bold text-text-secondary">
          {t('challenges.title', { defaultValue: 'Challenges' })}
        </Text>
        <Icon name="chevron-forward" size={14} color={accentPrimary} />
      </View>
      {shown.map((challenge, index) => {
        const state = challengeStateNow(challenge, now);
        const period = standings.byId.get(challenge.id);
        const own = period ? ownChallengeStanding(period.rows) : null;
        const leader = period
          ? (challengeLeaders(period.rows)[0] ?? null)
          : null;
        // In the units of the rules that scored the period, sent with it
        // (totals are formatted only once the period is in).
        const metric = (period ?? challenge).rules.metric;
        const line =
          state !== 'running'
            ? challengeStateText(state, challengeDaysToGo(challenge, now), t)
            : !period
              ? standings.failedIds.has(challenge.id)
                ? t('challenges.standings.loadFailed', {
                    defaultValue: 'Could not load the standings.',
                  })
                : ' '
              : own
                ? t('challenges.card.yourPlace', {
                    defaultValue: '#{{rank}} of {{members}} · {{total}}',
                    rank: own.rank,
                    members: period.rows.length,
                    total: formatChallengeValue(own.total, metric, units, t),
                  })
                : t('challenges.card.noScore', {
                    defaultValue: 'No score yet',
                  });
        const leaderLine =
          !leader || !own
            ? null
            : leadsChallenge(own)
              ? t('challenges.card.youLead', { defaultValue: 'You lead' })
              : t('challenges.card.leader', {
                  defaultValue: '{{name}} leads with {{total}}',
                  name: leader.display_name,
                  total: formatChallengeValue(leader.total, metric, units, t),
                });
        return (
          <Pressable
            key={challenge.id}
            testID={`challenges-card-row-${challenge.id}`}
            className={`py-2 ${index > 0 ? 'border-t border-border-subtle' : ''}`}
            onPress={() =>
              navigation.navigate('ChallengeDetail', {
                id: challenge.id,
                name: challenge.name,
              })
            }
            accessibilityRole="button"
          >
            <View className="flex-row items-center justify-between">
              <Text
                className="flex-1 mr-3 text-base font-semibold text-text-primary"
                numberOfLines={1}
              >
                {challenge.emoji
                  ? `${challenge.emoji} ${challenge.name}`
                  : challenge.name}
              </Text>
              <Text className="text-sm font-semibold text-text-primary">
                {line}
              </Text>
            </View>
            {leaderLine ? (
              <Text className="text-xs text-text-muted mt-0.5">
                {leaderLine}
              </Text>
            ) : null}
            {period && standings.failedIds.has(challenge.id) ? (
              // Still the last standings loaded; say they are not fresh.
              <Text className="text-xs text-text-muted mt-0.5">
                {t('challenges.card.refreshFailed', {
                  defaultValue: 'Could not refresh; showing the last loaded',
                })}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </Pressable>
  );
};

export default ChallengesCard;
