import React from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import SettingsRow from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFamilyUsers } from '../hooks';
import { useFamilyCopySource } from '../hooks/useFamilyDiary';
import { useMealTypes } from '../hooks/useMealTypes';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import { canCopyFamilyDiary, familyDiaryUserName } from '../utils/familyDiary';
import { filterFoodEntriesByMealTypeId } from '../utils/mealNutrition';

type FamilyMembersScreenProps = RootStackScreenProps<'FamilyMembers'>;

const FamilyMembersScreen: React.FC<FamilyMembersScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const copySource = route.params?.copySource;
  const {
    data: users = [],
    isLoading,
    isError,
    refetch,
  } = useFamilyUsers({ refetchOnFocus: Boolean(copySource) });
  const source = useFamilyCopySource({
    date: copySource?.sourceDate ?? '',
    enabled: Boolean(copySource),
  });
  const ownMealTypes = useMealTypes({ enabled: Boolean(copySource) });
  const recipients = copySource
    ? users.filter((user) => canCopyFamilyDiary(user))
    : users;
  const sourceEntries = copySource
    ? filterFoodEntriesByMealTypeId(
        source.data?.foodEntries ?? [],
        copySource.mealTypeId,
        copySource.mealTypeName,
        ownMealTypes.mealTypes
      )
    : [];
  const loadingSource =
    Boolean(copySource) && (source.isLoading || ownMealTypes.isLoading);
  const sourceFailed =
    Boolean(copySource) && (source.isError || ownMealTypes.isError);
  const title = copySource
    ? t('familyDiary.chooseCopyRecipient', { defaultValue: 'Choose recipient' })
    : t('familyDiary.title', { defaultValue: 'Family Diaries' });
  const header = useScreenHeader({
    title,
    nativeTitle: title,
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isLoading || loadingSource ? (
        <StatusView
          loading
          title={t('familyDiary.loadingMembers', {
            defaultValue: 'Loading family members…',
          })}
        />
      ) : isError || sourceFailed ? (
        <StatusView
          icon="alert-circle"
          title={
            sourceFailed
              ? t('familyDiary.copySourceFailed', {
                  defaultValue: "Couldn't load the source meal",
                })
              : t('familyDiary.loadMembersFailed', {
                  defaultValue: "Couldn't load family members",
                })
          }
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => {
              void refetch();
              if (copySource) {
                void source.refetch();
                void ownMealTypes.refetch();
              }
            },
            variant: 'primary',
          }}
        />
      ) : copySource && sourceEntries.length === 0 ? (
        <StatusView
          icon="food"
          title={t('familyDiary.copySourceEmpty', {
            defaultValue: 'No food entries in this meal',
          })}
        />
      ) : recipients.length === 0 ? (
        <StatusView
          icon="people"
          title={
            copySource
              ? t('familyDiary.noCopyRecipients', {
                  defaultValue: 'No family members with copy access',
                })
              : t('familyDiary.noMembers', {
                  defaultValue: 'No family members',
                })
          }
          subtitle={t('familyDiary.manageOnWeb', {
            defaultValue: 'Family diary access is managed in the web app.',
          })}
        />
      ) : (
        <FlatList
          data={recipients}
          keyExtractor={(user) => user.userId}
          testID="family-members-list"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding,
          }}
          renderItem={({ item }) => {
            const displayName = familyDiaryUserName(
              item,
              t('familyDiary.unnamedMember', {
                defaultValue: 'Family member',
              })
            );
            const capabilityLabel = canCopyFamilyDiary(item)
              ? t('familyDiary.canCopy', { defaultValue: 'Can copy' })
              : t('familyDiary.viewOnly', { defaultValue: 'View only' });

            return (
              <SettingsRow
                icon="people"
                title={displayName}
                subtitle={capabilityLabel}
                accessibilityLabel={`${displayName}. ${capabilityLabel}`}
                onPress={() => {
                  if (copySource) {
                    if (!canCopyFamilyDiary(item)) return;
                    navigation.navigate('FamilyCopyReview', {
                      ...copySource,
                      familyUser: item,
                      direction: 'to-family',
                      sourceEntries,
                      selectedEntryIds: sourceEntries.map((entry) => entry.id),
                    });
                  } else {
                    navigation.navigate('FamilyDiary', { familyUser: item });
                  }
                }}
              />
            );
          }}
        />
      )}
    </View>
  );
};

export default FamilyMembersScreen;
