import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OfflineSettingsScreen from '../../src/screens/OfflineSettingsScreen';
import { getCacheRow, putCacheRows } from '../../src/offline/cacheStore';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { enqueueOutbox, getOutboxRow } from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));

jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

describe('OfflineSettingsScreen', () => {
  let db: OfflineDb & { close(): void };

  const renderScreen = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <OfflineSettingsScreen
          navigation={mockNavigation}
          route={{ params: undefined } as any}
        />
      </QueryClientProvider>
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('says nothing is waiting when the queue is empty', async () => {
    const { findByTestId, queryByTestId } = renderScreen();

    expect(await findByTestId('offline-nothing-waiting')).toBeTruthy();
    expect(queryByTestId('offline-upload-now')).toBeNull();
  });

  it('lists a waiting workout with its status and offers Upload now', async () => {
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    await enqueueOutbox(db, {
      id: 'o1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: 'workout_session.create',
      entityId: 'session-1',
      entryDate: '2026-11-16',
      payload: {},
      payloadVersion: 1,
    });

    const { findByTestId, getByText, getByTestId } = renderScreen();

    expect(await findByTestId('offline-waiting-o1')).toBeTruthy();
    expect(getByText(/^Workout, /)).toBeTruthy();
    expect(getByTestId('offline-upload-now')).toBeTruthy();
  });

  it("does not list another account's waiting workouts", async () => {
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u2' } },
    ]);
    await enqueueOutbox(db, {
      id: 'o1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: 'workout_session.create',
      entityId: 'session-1',
      payload: {},
      payloadVersion: 1,
    });

    const { findByTestId } = renderScreen();

    expect(await findByTestId('offline-nothing-waiting')).toBeTruthy();
  });

  it('clears saved data but keeps what is still waiting to upload', async () => {
    await putCacheRows(db, 's1', 'exercise', [{ key: 'e1', payload: {} }]);
    await enqueueOutbox(db, {
      id: 'o1',
      serverConfigId: 's1',
      userId: 'u1',
      kind: 'workout_session.create',
      entityId: 'session-1',
      payload: {},
      payloadVersion: 1,
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByTestId } = renderScreen();

    fireEvent.press(await findByTestId('offline-clear'));
    const buttons = alert.mock.calls[0]![2]!;
    buttons.find((button) => button.style === 'destructive')!.onPress!();

    await waitFor(async () => {
      expect(await getCacheRow(db, 's1', 'exercise', 'e1')).toBeNull();
    });
    expect((await getOutboxRow(db, 'o1'))?.status).toBe('pending');
  });

  it('says what food and water are kept, with counts of what is on the phone', async () => {
    const { CACHE_COLLECTIONS } = require('../../src/offline/collections');
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.food, [
      { key: 'f1', name: 'Bread', payload: { id: 'f1' } },
      { key: 'f2', name: 'Cheese', payload: { id: 'f2' } },
    ]);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.meal, [
      { key: 'm1', name: 'Porridge', payload: { id: 'm1' } },
    ]);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.diaryFoodDay, [
      { key: '2026-11-20', payload: [] },
      { key: '2026-11-21', payload: [] },
    ]);

    const { findByText, getByTestId, getByText } = renderScreen();

    expect(await findByText('Food and water kept offline')).toBeTruthy();
    await waitFor(() => {
      expect(getByTestId('offline-foods-kept')).toHaveTextContent(/2 foods/);
      expect(getByTestId('offline-meals-kept')).toHaveTextContent(/1 meal/);
      expect(getByTestId('offline-diary-days-kept')).toHaveTextContent(
        /2 days of food/
      );
    });
    // The intro no longer speaks of workouts alone.
    expect(
      getByText(/Workouts, food, meals, new foods and drinks/)
    ).toBeTruthy();
  });

  it('lists a waiting food, a new food, a changed entry and a deleted meal by what they are', async () => {
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    for (const [kind, entityId] of [
      ['food.create', 'k1'],
      ['food_entry.update', 'k2'],
      ['food_entry_meal.delete', 'k3'],
    ] as const) {
      await enqueueOutbox(db, {
        id: `row-${entityId}`,
        serverConfigId: 's1',
        userId: 'u1',
        kind,
        entityId,
        entryDate: '2026-11-21',
        payload: {},
        payloadVersion: 1,
      });
    }

    const { findByTestId, queryByText } = renderScreen();

    expect(await findByTestId('offline-waiting-row-k1')).toHaveTextContent(
      /Food entry/
    );
    expect(await findByTestId('offline-waiting-row-k2')).toHaveTextContent(
      /Food entry/
    );
    expect(await findByTestId('offline-waiting-row-k3')).toHaveTextContent(
      /Food entry/
    );
    expect(queryByText(/Saved change/)).toBeNull();
  });
});
