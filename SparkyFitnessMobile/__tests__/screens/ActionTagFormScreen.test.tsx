import React from 'react';
import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ActionTagFormScreen from '../../src/screens/ActionTagFormScreen';
import {
  useActionTagsQuery,
  useCreateActionTagMutation,
  useDeleteActionTagMutation,
  useUpdateActionTagMutation,
} from '../../src/hooks/useActionTags';
import { useNfcSupport } from '../../src/hooks/useNfcSupport';
import { useWaterContainersQuery } from '../../src/hooks';
import { writeTag } from '../../src/services/nfc/nfcService';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useActionTags', () => ({
  useActionTagsQuery: jest.fn(),
  useCreateActionTagMutation: jest.fn(),
  useUpdateActionTagMutation: jest.fn(),
  useDeleteActionTagMutation: jest.fn(),
}));
jest.mock('../../src/hooks/useNfcSupport', () => ({
  useNfcSupport: jest.fn(),
}));
jest.mock('../../src/hooks', () => ({ useWaterContainersQuery: jest.fn() }));
jest.mock('../../src/services/nfc/nfcService', () => ({
  generateTagCode: () => '0123456789abcdef0123456789abcdef',
  writeTag: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const CODE = '0123456789abcdef0123456789abcdef';
const createTag = jest.fn();
const updateTag = jest.fn();
const navigation = { goBack: jest.fn() };

const renderForm = (params?: object) =>
  render(
    <ActionTagFormScreen
      {...({
        navigation,
        route: { params },
      } as unknown as RootStackScreenProps<'ActionTagForm'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  createTag.mockResolvedValue({});
  updateTag.mockResolvedValue({});
  jest.mocked(useNfcSupport).mockReturnValue({
    supported: true,
    enabled: true,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useNfcSupport>);
  jest.mocked(useWaterContainersQuery).mockReturnValue({
    containers: [{ id: 7, name: 'Stanley' }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useWaterContainersQuery>);
  jest.mocked(useActionTagsQuery).mockReturnValue({
    tags: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useActionTagsQuery>);
  jest.mocked(useCreateActionTagMutation).mockReturnValue({
    createActionTagAsync: createTag,
    isPending: false,
  });
  jest.mocked(useUpdateActionTagMutation).mockReturnValue({
    updateActionTagAsync: updateTag,
    isPending: false,
  });
  jest.mocked(useDeleteActionTagMutation).mockReturnValue({
    deleteActionTagAsync: jest.fn(),
    isPending: false,
  });
});

const preset = {
  presetAction: { type: 'water', container_id: 7, drinks: 1 },
};

describe('ActionTagFormScreen', () => {
  it('writes the sticker first, then saves the tag with the same code', async () => {
    jest.mocked(writeTag).mockResolvedValue({ status: 'written' });
    renderForm(preset);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(writeTag).toHaveBeenCalledWith(
      CODE,
      expect.objectContaining({ overwrite: false })
    );
    expect(createTag).toHaveBeenCalledWith({
      tag_code: CODE,
      label: 'Stanley',
      action: { type: 'water', container_id: 7, drinks: 1 },
      ask_before_running: false,
    });
    expect(writeTag.mock.invocationCallOrder[0]).toBeLessThan(
      createTag.mock.invocationCallOrder[0]
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('saves nothing when writing the sticker fails or is cancelled', async () => {
    jest.mocked(writeTag).mockResolvedValue({ status: 'cancelled' });
    renderForm(preset);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(writeTag).toHaveBeenCalled());
    expect(createTag).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('asks before replacing data already on the sticker', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(writeTag).mockResolvedValueOnce({
      status: 'has_data',
      contents: { kind: 'other' },
    });
    renderForm(preset);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    // Cancelling the prompt leaves the sticker alone and saves nothing.
    const buttons = alertSpy.mock.calls[0][2] as { onPress?: () => void }[];
    buttons[0].onPress?.();
    await waitFor(() => expect(navigation.goBack).not.toHaveBeenCalled());
    expect(createTag).not.toHaveBeenCalled();
    expect(writeTag).toHaveBeenCalledTimes(1);
  });

  it('does not write anything for a tag found by a tap, only saves it', async () => {
    renderForm({ tagCode: 'f'.repeat(32), ...preset });
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(createTag).toHaveBeenCalled());
    expect(writeTag).not.toHaveBeenCalled();
    expect(createTag).toHaveBeenCalledWith(
      expect.objectContaining({ tag_code: 'f'.repeat(32) })
    );
  });

  it('refuses an invalid number of drinks', async () => {
    renderForm(preset);
    fireEvent.changeText(screen.getByDisplayValue('1'), '0');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(writeTag).not.toHaveBeenCalled());
    expect(createTag).not.toHaveBeenCalled();
  });

  it('tells a phone without NFC that it cannot set up tags', () => {
    jest.mocked(useNfcSupport).mockReturnValue({
      supported: false,
      enabled: false,
      isLoading: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useNfcSupport>);
    renderForm(preset);
    expect(screen.getByText('This phone cannot use NFC tags')).toBeTruthy();
  });
});
