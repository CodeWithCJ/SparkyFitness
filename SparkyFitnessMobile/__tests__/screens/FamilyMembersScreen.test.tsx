import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FamilyMembersScreen from '../../src/screens/FamilyMembersScreen';
import { useFamilyUsers } from '../../src/hooks';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'FamilyMembers'>;

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
} as unknown as ScreenProps['navigation'];

const route = {
  key: 'FamilyMembers-1',
  name: 'FamilyMembers',
  params: undefined,
} as unknown as ScreenProps['route'];

jest.mock('../../src/hooks', () => ({
  useFamilyUsers: jest.fn(),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 12),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'familyDiary.title': 'Family Diaries',
        'familyDiary.loadingMembers': 'Loading family members…',
        'familyDiary.loadMembersFailed': "Couldn't load family members",
        'familyDiary.noMembers': 'No family members',
        'familyDiary.manageOnWeb':
          'Family diary access is managed in the web app.',
        'familyDiary.canCopy': 'Can copy',
        'familyDiary.viewOnly': 'View only',
        'familyDiary.unnamedMember': 'Family member',
        'common.retry': 'Retry',
      })[key] ?? key,
  }),
}));

const mockUseFamilyUsers = useFamilyUsers as jest.MockedFunction<
  typeof useFamilyUsers
>;

const renderScreen = (bottomInset = 0) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: bottomInset, left: 0, right: 0 },
      }}
    >
      <FamilyMembersScreen navigation={navigation} route={route} />
    </SafeAreaProvider>
  );

describe('FamilyMembersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('opens a copy-enabled family diary', () => {
    mockUseFamilyUsers.mockReturnValue({
      data: [
        {
          userId: 'member-b',
          displayName: 'Member B',
          email: 'b@example.test',
          canCopy: true,
          accessEndDate: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyUsers>);

    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('Member B. Can copy'));

    expect(navigation.navigate).toHaveBeenCalledWith('FamilyDiary', {
      familyUser: expect.objectContaining({
        userId: 'member-b',
        canCopy: true,
      }),
    });
  });

  test('labels a diary-only connection as read only', () => {
    mockUseFamilyUsers.mockReturnValue({
      data: [
        {
          userId: 'member-a',
          displayName: 'Member A',
          email: null,
          canCopy: false,
          accessEndDate: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyUsers>);

    expect(renderScreen().getByLabelText('Member A. View only')).toBeTruthy();
  });

  test('uses a localized fallback for a member without a name or email', () => {
    mockUseFamilyUsers.mockReturnValue({
      data: [
        {
          userId: 'member-unnamed',
          displayName: '',
          email: null,
          canCopy: false,
          accessEndDate: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyUsers>);

    expect(
      renderScreen().getByLabelText('Family member. View only')
    ).toBeTruthy();
  });

  test('explains that empty family access is managed on the web', () => {
    mockUseFamilyUsers.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyUsers>);

    expect(
      renderScreen().getByText('Family diary access is managed in the web app.')
    ).toBeTruthy();
  });

  test('leaves safe-area and active-workout space below the member list', () => {
    mockUseFamilyUsers.mockReturnValue({
      data: [
        {
          userId: 'member-a',
          displayName: 'Member A',
          email: null,
          canCopy: false,
          accessEndDate: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyUsers>);

    const { getByTestId } = renderScreen(20);

    expect(
      getByTestId('family-members-list').props.contentContainerStyle
    ).toEqual({
      padding: 16,
      paddingBottom: 48,
    });
  });

  test('shows a loading state while family members are loading', () => {
    mockUseFamilyUsers.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyUsers>);

    expect(renderScreen().getByText('Loading family members…')).toBeTruthy();
  });

  test('retries after the family member request fails', () => {
    const refetch = jest.fn();
    mockUseFamilyUsers.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as ReturnType<typeof useFamilyUsers>);

    const { getByText } = renderScreen();
    fireEvent.press(getByText('Retry'));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
