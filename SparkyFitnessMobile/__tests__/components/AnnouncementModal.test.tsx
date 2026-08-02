import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AnnouncementModal, DISMISSED_ANNOUNCEMENT_KEY } from '../../src/components/AnnouncementModal';

jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = jest.requireMock('../../src/services/api/apiClient').apiFetch as jest.Mock;

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & {
    __setTestLocale: (value: 'en' | 'pl') => void;
  }).__setTestLocale(locale);
}

describe('AnnouncementModal', () => {
  beforeEach(async () => {
    mockApiFetch.mockResolvedValue({ id: 'announcement-1', active: true, title: 'Server title', message: 'Server message' });
    await AsyncStorage.clear();
  });

  it.each([
    ['en', 'Announcement', 'Close', "Got it, don't show again"],
    ['pl', 'Ogłoszenie', 'Zamknij', 'Rozumiem, nie pokazuj ponownie'],
  ] as const)('localizes controls and keeps server content literal in %s', async (locale, fallback, close, dismiss) => {
    setTestLocale(locale);
    mockApiFetch.mockResolvedValue({ id: 'announcement-1', active: true, title: '', message: 'Server message' });
    const view = render(<AnnouncementModal />);
    await waitFor(() => expect(view.getByText(fallback)).toBeTruthy());
    expect(view.getByText('Server message')).toBeTruthy();
    expect(view.getByLabelText(close)).toBeTruthy();
    expect(view.getByText(dismiss)).toBeTruthy();
    fireEvent.press(view.getByLabelText(close));
    expect(view.queryByText(fallback)).toBeNull();
    expect(await AsyncStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY)).toBeNull();
  });

  it('does not persist on close but persists the exact id on dismiss', async () => {
    const view = render(<AnnouncementModal />);
    await waitFor(() => expect(view.getByText('Server title')).toBeTruthy());
    fireEvent.press(view.getByLabelText("Got it, don't show again"));
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(DISMISSED_ANNOUNCEMENT_KEY)).toBe('announcement-1');
      expect(view.queryByLabelText('Close')).toBeNull();
    });
  });
});
