import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FamilyMembersScreen from '../../src/screens/FamilyMembersScreen';
import { useFamilyUsers } from '../../src/hooks';
import { useFamilyCopySource } from '../../src/hooks/useFamilyDiary';
import { useMealTypes } from '../../src/hooks/useMealTypes';
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

jest.mock('../../src/hooks/useFamilyDiary', () => ({
  useFamilyCopySource: jest.fn(),
}));
jest.mock('../../src/hooks/useMealTypes', () => ({ useMealTypes: jest.fn() }));

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

const renderScreen = (
  bottomInset = 0,
  params?: ScreenProps['route']['params']
) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: bottomInset, left: 0, right: 0 },
      }}
    >
      <FamilyMembersScreen
        navigation={navigation}
        route={{ ...route, params }}
      />
    </SafeAreaProvider>
  );

describe('FamilyMembersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-24T10:00:00Z'));
    (useFamilyCopySource as jest.Mock).mockReturnValue({
      data: { foodEntries: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    (useMealTypes as jest.Mock).mockReturnValue({
      mealTypes: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  afterEach(() => jest.useRealTimers());

  test.each([
    [true, false],
    [false, true],
    [true, true],
  ])(
    'keeps cached recipients available during users=%s and source=%s background refreshes',
    (usersFetching, sourceFetching) => {
      mockUseFamilyUsers.mockReturnValue({
        data: [
          {
            userId: 'recipient',
            displayName: 'Recipient',
            email: null,
            canCopy: true,
            accessEndDate: null,
          },
        ],
        isLoading: false,
        isFetching: usersFetching,
        isError: false,
        refetch: jest.fn(),
      } as ReturnType<typeof useFamilyUsers>);
      (useFamilyCopySource as jest.Mock).mockReturnValue({
        data: { foodEntries: [{ id: 'entry', meal_type_id: 'own-dinner' }] },
        isLoading: false,
        isFetching: sourceFetching,
        isError: false,
        refetch: jest.fn(),
      });
      const screen = renderScreen(0, {
        copySource: {
          sourceDate: '2026-08-23',
          mealTypeId: 'own-dinner',
          mealTypeName: 'Dinner',
        },
      });
      expect(screen.getByLabelText('Recipient. Can copy')).toBeTruthy();
      expect(screen.queryByText('Loading family members…')).toBeNull();
    }
  );

  test('selects only writable, unexpired recipients and reviews raw source components', () => {
    const recipient = {
      userId: 'recipient',
      displayName: 'Recipient',
      email: null,
      canCopy: true,
      accessEndDate: null,
    };
    mockUseFamilyUsers.mockReturnValue({
      data: [
        recipient,
        {
          ...recipient,
          userId: 'read-only',
          displayName: 'Read only',
          canCopy: false,
        },
        {
          ...recipient,
          userId: 'expired',
          displayName: 'Expired',
          accessEndDate: '2026-08-24T09:59:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyUsers>);
    const component = {
      id: 'real-component',
      meal_type_id: 'own-custom',
      meal_type: 'Dinner',
      food_entry_meal_id: 'container',
    };
    (useFamilyCopySource as jest.Mock).mockReturnValue({
      data: {
        foodEntries: [
          component,
          {
            id: 'other-meal',
            meal_type_id: 'system-dinner',
            meal_type: 'Dinner',
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    const copySource = {
      sourceDate: '2026-08-23',
      mealTypeId: 'own-custom',
      mealTypeName: 'Dinner',
    };
    const screen = renderScreen(0, { copySource });
    expect(mockUseFamilyUsers).toHaveBeenCalledWith({ refetchOnFocus: true });
    expect(screen.queryByText('Read only')).toBeNull();
    expect(screen.queryByText('Expired')).toBeNull();
    fireEvent.press(screen.getByLabelText('Recipient. Can copy'));
    expect(navigation.navigate).toHaveBeenCalledWith('FamilyCopyReview', {
      ...copySource,
      familyUser: recipient,
      direction: 'to-family',
      sourceEntries: [component],
      selectedEntryIds: ['real-component'],
    });
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
    expect(mockUseFamilyUsers).toHaveBeenCalledWith({ refetchOnFocus: false });
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
