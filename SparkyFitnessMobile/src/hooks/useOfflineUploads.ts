import { useEffect } from 'react';
import { AppState } from 'react-native';
import { registerAllOutboxHandlers } from '../offline/handlers';
import {
  loadOfflineImageIndex,
  refreshOfflineImages,
} from '../offline/offlineImages';
import { refreshOfflinePack } from '../offline/offlinePack';
import { getActiveServerConfigId } from '../services/storage';
import { drainOutbox } from '../offline/syncEngine';
import { remindAboutLongWaitingUploads } from '../offline/waitingReminder';
import { useServerConnection } from './useServerConnection';

/**
 * Keeps the phone ready for offline use. Mounted once at the app root.
 *
 * Whenever the app opens or returns to the foreground it sends work logged
 * without a connection. While the server is reachable it also refreshes the
 * data a workout needs offline (at most every six hours). The other upload
 * triggers are the reconnect detection in `queryClient.ts`, the background
 * task and the Upload now button; a run in progress absorbs any of them.
 */
export function useOfflineUploads(): void {
  const { isConnected, status, refetch } = useServerConnection();

  // While the server cannot be reached nothing else re-checks the connection,
  // so a workout waiting to upload would sit until the app is reopened. A
  // light check every 30 seconds notices the way back; the reconnect handler
  // in queryClient.ts then starts the upload. Online it does nothing.
  useEffect(() => {
    if (status !== 'unreachable') return;
    const timer = setInterval(() => void refetch(), 30_000);
    return () => clearInterval(timer);
  }, [status, refetch]);

  useEffect(() => {
    registerAllOutboxHandlers();
    const uploadThenRemind = async () => {
      await drainOutbox('foreground');
      // Whatever is still waiting a week on is mentioned once.
      await remindAboutLongWaitingUploads().catch(() => undefined);
    };
    void uploadThenRemind();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void uploadThenRemind();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // The saved pictures of the active server, so images show offline.
    void getActiveServerConfigId()
      .then((id) => (id ? loadOfflineImageIndex(id) : undefined))
      .catch(() => undefined);
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    const refresh = async () => {
      const refreshed = await refreshOfflinePack();
      // The refresh is what records who is signed in. Uploads that were held
      // because that was unknown (just after an account switch) can go now.
      if (refreshed) await drainOutbox('foreground');
      // Pictures follow the data they belong to (Wi-Fi only by default).
      await refreshOfflineImages();
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [isConnected]);
}
