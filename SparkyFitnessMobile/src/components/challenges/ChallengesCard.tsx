import React, { useMemo } from 'react';
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
  challengeLeaders,
  challengeState,
  leadsChallenge,
  ownChallengeStanding,
  sortChallenges,
} from '@workspace/shared';
import {
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
  selectedDate: string;
}

/** Most challenges the card lists; the rest are a tap away. */
export const CHALLENGES_CARD_LIMIT = 3;

/**
 * The user's place in each challenge running on the selected day. Hidden on a
 * server without Challenges and for anyone not in a running challenge.
 */
const ChallengesCard: React.FC<ChallengesCardProps> = ({
  navigation,
  selectedDate,
}) => {
  const { t } = useTranslation();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const { challenges } = useChallenges();
  const running = useMemo(
    () =>
      sortChallenges(challenges, selectedDate)
        .filter((c) => challengeState(c, selectedDate) === 'running')
        .slice(0, CHALLENGES_CARD_LIMIT),
    [challenges, selectedDate]
  );
  const ids = useMemo(() => running.map((c) => c.id), [running]);
  const standings = useChallengesStandings(ids, selectedDate);
  const { preferences } = usePreferences({ enabled: running.length > 0 });
  const energyUnit = useEnergyUnit();
  const units: ChallengeUnits = {
    distanceUnit:
      preferences?.default_distance_unit === 'miles' ? 'miles' : 'km',
    energyUnit,
  };

  if (running.length === 0) return null;

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
      {running.map((challenge, index) => {
        const period = standings.byId.get(challenge.id);
        const own = period ? ownChallengeStanding(period.rows) : null;
        const leader = period
          ? (challengeLeaders(period.rows)[0] ?? null)
          : null;
        // In the units of the rules that scored the period, sent with it
        // (totals are formatted only once the period is in).
        const metric = (period ?? challenge).rules.metric;
        const line = !period
          ? ' '
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
          </Pressable>
        );
      })}
    </Pressable>
  );
};

export default ChallengesCard;
