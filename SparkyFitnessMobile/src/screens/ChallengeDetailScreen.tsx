import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { addDays } from '@workspace/shared';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import ServerGate from '../components/ServerGate';
import ChallengeStandingsList from '../components/challenges/ChallengeStandingsList';
import {
  useChallenge,
  useChallengeMutations,
  useChallengeRuleChanges,
  useChallengeStandings,
} from '../hooks/useChallenges';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { usePreferences } from '../hooks/usePreferences';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useAppLocale } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatShortDate, getTodayDate } from '../utils/dateUtils';
import {
  challengeRulesSummary,
  challengeToday,
  formatChallengeValue,
  rulesInEffect,
  type ChallengeUnits,
} from '../utils/challenges';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ChallengeDetail'>;

/**
 * One challenge: its rules in a line, the standings of a period with arrows
 * to earlier ones, and leaving. Hosting (rules, invites) stays on the web.
 */
const ChallengeDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { id, name: initialName } = route.params;
  const { t } = useTranslation();
  const locale = useAppLocale();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  // null is the challenge's current period; a day picks an earlier one.
  const [periodDay, setPeriodDay] = useState<string | null>(null);
  const challengeQuery = useChallenge(id);
  const standingsQuery = useChallengeStandings(id, periodDay);
  const ruleChangesQuery = useChallengeRuleChanges(id);
  const { refetch: refetchChallenge } = challengeQuery;
  const { refetch: refetchStandings } = standingsQuery;
  const refetchOnFocus = useCallback(() => {
    void refetchChallenge();
    void refetchStandings();
  }, [refetchChallenge, refetchStandings]);
  useRefetchOnFocus(refetchOnFocus, true);
  const { preferences } = usePreferences();
  const energyUnit = useEnergyUnit();
  const units: ChallengeUnits = {
    distanceUnit:
      preferences?.default_distance_unit === 'miles' ? 'miles' : 'km',
    energyUnit,
  };
  const { leaveChallenge } = useChallengeMutations();
  // The Alert's handler keeps the render it was made in, so a second tap is
  // stopped with a ref rather than the mutation's pending state.
  const leavingRef = useRef(false);

  const challenge = challengeQuery.data;
  const standings = standingsQuery.data;
  const title = challenge?.name ?? initialName ?? '';

  const confirmLeave = () => {
    Alert.alert(
      t('challenges.leave.title', { defaultValue: 'Leave this challenge?' }),
      t('challenges.leave.message', {
        defaultValue:
          'Your scores in it are deleted. You can join again with a new invite code.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('challenges.leave.confirm', { defaultValue: 'Leave' }),
          style: 'destructive',
          onPress: () => {
            if (leavingRef.current) return;
            leavingRef.current = true;
            leaveChallenge(id)
              .then(() => navigation.goBack())
              .catch(() => {
                leavingRef.current = false;
                Toast.show({
                  type: 'error',
                  text1: t('challenges.leave.failed', {
                    defaultValue: 'Could not leave the challenge',
                  }),
                });
              });
          },
        },
      ]
    );
  };

  const header = useScreenHeader({
    title,
    left: { kind: 'back' },
    right: challenge
      ? {
          kind: 'menu',
          accessibilityLabel: t('challenges.moreActions', {
            defaultValue: 'More actions',
          }),
          items: [
            {
              label: t('challenges.leave.action', {
                defaultValue: 'Leave challenge',
              }),
              sfSymbol: 'rectangle.portrait.and.arrow.right',
              onPress: confirmLeave,
            },
          ],
          identifier: 'challenge-detail-menu',
        }
      : null,
  });

  // The challenge's own today, as the server counts its days.
  const today = challenge
    ? challengeToday(challenge, new Date())
    : getTodayDate();
  const canGoBack =
    !!challenge && !!standings && standings.period_start > challenge.start_date;
  // Not past today, and not past the end: the server answers a later date
  // with the final period again.
  const canGoForward =
    !!standings &&
    periodDay !== null &&
    standings.period_end < today &&
    (!challenge?.end_date || standings.period_end < challenge.end_date);

  let body: React.ReactNode;
  if (challengeQuery.isLoading) {
    body = <ActivityIndicator className="mt-8" />;
  } else if (challengeQuery.isError || !challenge) {
    body = (
      <View className="items-center py-8">
        <Text className="text-text-secondary text-base mb-3">
          {t('challenges.detailLoadFailed', {
            defaultValue: 'Could not load this challenge.',
          })}
        </Text>
        <Button
          variant="secondary"
          onPress={() => void challengeQuery.refetch()}
        >
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </View>
    );
  } else {
    // The rules that scored the period shown (a change counts from the next).
    const rules = rulesInEffect(
      ruleChangesQuery.data,
      standings?.period_start ?? today,
      challenge.rules
    );
    const dates = challenge.end_date
      ? t('challenges.dates.range', {
          defaultValue: '{{start}} to {{end}}',
          start: formatShortDate(challenge.start_date, locale),
          end: formatShortDate(challenge.end_date, locale),
        })
      : t('challenges.dates.from', {
          defaultValue: 'From {{start}}, no end date',
          start: formatShortDate(challenge.start_date, locale),
        });
    const target =
      rules.target !== null && rules.format !== 'leaderboard'
        ? formatChallengeValue(rules.target, rules.metric, units, t)
        : null;

    body = (
      <>
        <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
          <Text className="text-xl font-bold text-text-primary">
            {challenge.emoji
              ? `${challenge.emoji} ${challenge.name}`
              : challenge.name}
          </Text>
          {challenge.description ? (
            <Text className="text-sm text-text-secondary mt-1">
              {challenge.description}
            </Text>
          ) : null}
          <Text className="text-sm text-text-primary mt-3">
            {challengeRulesSummary(rules, t, locale)}
          </Text>
          {target ? (
            <Text className="text-sm text-text-secondary mt-1">
              {t('challenges.target', {
                defaultValue: 'Target: {{target}}',
                target,
              })}
            </Text>
          ) : null}
          <Text className="text-xs text-text-muted mt-2">
            {dates}
            {' · '}
            {t('challenges.memberCount', {
              defaultValue_one: '{{count}} member',
              defaultValue_other: '{{count}} members',
              defaultValue: '{{count}} members',
              count: challenge.member_count,
            })}
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
          <View className="flex-row items-center justify-between mb-2">
            <Pressable
              onPress={() =>
                standings && setPeriodDay(addDays(standings.period_start, -1))
              }
              disabled={!canGoBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('challenges.period.previous', {
                defaultValue: 'Previous period',
              })}
              accessibilityState={{ disabled: !canGoBack }}
            >
              <Icon
                name="chevron-back"
                size={18}
                color={canGoBack ? accentPrimary : textMuted}
              />
            </Pressable>
            <View className="items-center flex-1">
              <Text className="text-md font-bold text-text-primary">
                {standings
                  ? standings.period_start === standings.period_end
                    ? formatShortDate(standings.period_start, locale)
                    : t('challenges.dates.range', {
                        defaultValue: '{{start}} to {{end}}',
                        start: formatShortDate(standings.period_start, locale),
                        end: formatShortDate(standings.period_end, locale),
                      })
                  : ' '}
              </Text>
              {standings ? (
                <Text className="text-xs text-text-muted mt-0.5">
                  {standings.final
                    ? t('challenges.standings.final', {
                        defaultValue: 'Final results',
                      })
                    : t('challenges.standings.live', {
                        defaultValue: 'So far; late watch syncs still count',
                      })}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() =>
                standings &&
                setPeriodDay(
                  addDays(standings.period_end, 1) > today
                    ? null
                    : addDays(standings.period_end, 1)
                )
              }
              disabled={!canGoForward}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('challenges.period.next', {
                defaultValue: 'Next period',
              })}
              accessibilityState={{ disabled: !canGoForward }}
            >
              <Icon
                name="chevron-forward"
                size={18}
                color={canGoForward ? accentPrimary : textMuted}
              />
            </Pressable>
          </View>

          {rules.format === 'group_goal' && standings && target ? (
            <Text className="text-sm text-text-secondary mb-2">
              {t('challenges.standings.groupTotal', {
                defaultValue: 'Together: {{total}} of {{target}}',
                total: formatChallengeValue(
                  standings.group_total,
                  rules.metric,
                  units,
                  t
                ),
                target,
              })}
            </Text>
          ) : null}

          {standingsQuery.isLoading ? (
            <ActivityIndicator className="my-4" />
          ) : standingsQuery.isError || !standings ? (
            <View className="items-center py-4">
              <Text className="text-text-secondary text-sm mb-3">
                {t('challenges.standings.loadFailed', {
                  defaultValue: 'Could not load the standings.',
                })}
              </Text>
              <Button
                variant="secondary"
                onPress={() => void standingsQuery.refetch()}
              >
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            </View>
          ) : (
            <ChallengeStandingsList
              standings={standings}
              rules={rules}
              units={units}
            />
          )}
        </View>

        {challenge.is_host ? (
          <Text className="text-xs text-text-muted text-center px-4">
            {t('challenges.hostOnWeb', {
              defaultValue:
                'You host this challenge. Change its rules and invite codes on the web.',
            })}
          </Text>
        ) : null}
      </>
    );
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

export default ChallengeDetailScreen;
