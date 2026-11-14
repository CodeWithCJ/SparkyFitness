import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { ChallengeSummary } from '@workspace/shared';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import ServerGate from '../components/ServerGate';
import StatusView from '../components/StatusView';
import { useChallenges } from '../hooks/useChallenges';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useAppLocale } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatShortDate, getTodayDate } from '../utils/dateUtils';
import {
  challengeRulesSummary,
  challengeState,
  sortChallenges,
} from '../utils/challenges';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'Challenges'>;

interface ChallengeRowProps {
  challenge: ChallengeSummary;
  today: string;
  onPress: () => void;
}

const ChallengeRow: React.FC<ChallengeRowProps> = ({
  challenge,
  today,
  onPress,
}) => {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const state = challengeState(challenge, today);
  const stateLabel =
    state === 'running'
      ? t('challenges.state.running', { defaultValue: 'Running' })
      : state === 'upcoming'
        ? t('challenges.state.startsOn', {
            defaultValue: 'Starts {{date}}',
            date: formatShortDate(challenge.start_date, locale),
          })
        : t('challenges.state.ended', { defaultValue: 'Ended' });

  return (
    <Pressable
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm flex-row items-center"
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <View className="flex-1 mr-3">
        <Text
          className="text-base font-semibold text-text-primary"
          numberOfLines={1}
        >
          {challenge.emoji
            ? `${challenge.emoji} ${challenge.name}`
            : challenge.name}
        </Text>
        <Text className="text-sm text-text-secondary mt-0.5" numberOfLines={2}>
          {challengeRulesSummary(challenge.rules, t, locale)}
        </Text>
        <View className="flex-row items-center gap-2 mt-2">
          <Text
            className={`text-xs font-semibold ${
              state === 'running' ? 'text-accent-primary' : 'text-text-muted'
            }`}
          >
            {stateLabel}
          </Text>
          <Text className="text-xs text-text-muted">
            {t('challenges.memberCount', {
              defaultValue_one: '{{count}} member',
              defaultValue_other: '{{count}} members',
              defaultValue: '{{count}} members',
              count: challenge.member_count,
            })}
          </Text>
          {challenge.is_host ? (
            <Text className="text-xs text-text-muted">
              {t('challenges.youHost', { defaultValue: 'You host' })}
            </Text>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-forward" size={18} color={textMuted} />
    </Pressable>
  );
};

/** The challenges the user is in, newest running first, with join by code. */
const ChallengesScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { challenges, isEnabled, isLoading, isError, refetch } =
    useChallenges();
  useRefetchOnFocus(() => void refetch(), true);
  const today = getTodayDate();
  const sorted = useMemo(
    () => sortChallenges(challenges, today),
    [challenges, today]
  );
  const openJoin = () => navigation.navigate('ChallengeJoin');

  const header = useScreenHeader({
    title: t('challenges.title', { defaultValue: 'Challenges' }),
    left: { kind: 'back' },
    right: isEnabled
      ? {
          kind: 'icon',
          ionicon: 'add-outline',
          sfSymbol: 'plus',
          role: 'primary',
          accessibilityLabel: t('challenges.join.title', {
            defaultValue: 'Join a challenge',
          }),
          onPress: openJoin,
        }
      : null,
  });

  let body: React.ReactNode;
  if (isLoading) {
    body = <ActivityIndicator className="mt-8" />;
  } else if (isError) {
    body = (
      <View className="items-center py-8">
        <Text className="text-text-secondary text-base mb-3">
          {t('challenges.loadFailed', {
            defaultValue: 'Could not load your challenges.',
          })}
        </Text>
        <Button variant="secondary" onPress={() => void refetch()}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </View>
    );
  } else if (!isEnabled) {
    body = (
      <StatusView
        icon="trophy-outline"
        iconTone="muted"
        title={t('challenges.unavailableTitle', {
          defaultValue: 'Challenges are not available',
        })}
        subtitle={t('challenges.unavailableSubtitle', {
          defaultValue:
            'Challenges are turned off on your server, or it needs an update. Ask your server admin.',
        })}
      />
    );
  } else if (sorted.length === 0) {
    body = (
      <StatusView
        icon="trophy-outline"
        title={t('challenges.emptyTitle', {
          defaultValue: 'No challenges yet',
        })}
        subtitle={t('challenges.emptySubtitle', {
          defaultValue:
            'Join one with an invite code from a friend, or host your own on the web.',
        })}
        action={{
          label: t('challenges.join.withCode', {
            defaultValue: 'Join with a code',
          }),
          onPress: openJoin,
          variant: 'primary',
        }}
      />
    );
  } else {
    body = sorted.map((challenge) => (
      <ChallengeRow
        key={challenge.id}
        challenge={challenge}
        today={today}
        onPress={() =>
          navigation.navigate('ChallengeDetail', {
            id: challenge.id,
            name: challenge.name,
          })
        }
      />
    ));
  }

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ServerGate>
        <ScrollView
          className="flex-1 bg-background"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          contentInsetAdjustmentBehavior={
            usesNativeHeader ? 'automatic' : undefined
          }
        >
          {body}
        </ScrollView>
      </ServerGate>
    </View>
  );
};

export default ChallengesScreen;
