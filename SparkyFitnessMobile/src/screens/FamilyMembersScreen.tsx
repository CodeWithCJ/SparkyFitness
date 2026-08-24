import React from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import SettingsRow from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFamilyUsers } from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import { familyDiaryUserName } from '../utils/familyDiary';

type FamilyMembersScreenProps = RootStackScreenProps<'FamilyMembers'>;

const FamilyMembersScreen: React.FC<FamilyMembersScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { data: users = [], isLoading, isError, refetch } = useFamilyUsers();
  const header = useScreenHeader({
    title: t('familyDiary.title', { defaultValue: 'Family Diaries' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isLoading ? (
        <StatusView
          loading
          title={t('familyDiary.loadingMembers', {
            defaultValue: 'Loading family members…',
          })}
        />
      ) : isError ? (
        <StatusView
          icon="alert-circle"
          title={t('familyDiary.loadMembersFailed', {
            defaultValue: "Couldn't load family members",
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      ) : users.length === 0 ? (
        <StatusView
          icon="people"
          title={t('familyDiary.noMembers', {
            defaultValue: 'No family members',
          })}
          subtitle={t('familyDiary.manageOnWeb', {
            defaultValue: 'Family diary access is managed in the web app.',
          })}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={user => user.userId}
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
              }),
            );
            const capabilityLabel = item.canCopy
              ? t('familyDiary.canCopy', { defaultValue: 'Can copy' })
              : t('familyDiary.viewOnly', { defaultValue: 'View only' });

            return (
              <SettingsRow
                icon="people"
                title={displayName}
                subtitle={capabilityLabel}
                accessibilityLabel={`${displayName}. ${capabilityLabel}`}
                onPress={() =>
                  navigation.navigate('FamilyDiary', { familyUser: item })
                }
              />
            );
          }}
        />
      )}
    </View>
  );
};

export default FamilyMembersScreen;
