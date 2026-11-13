import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { WatchRouteLibraryPayload } from '../../modules/watch-connectivity';
import {
  applyLibraryReport,
  DEFAULT_WATCH_ROUTE_CAPACITY,
} from '../utils/watchRouteSync';

interface WatchRouteState {
  /** Route id -> the revision (epoch ms) last sent to the watch. */
  sent: Record<string, number>;
  /** What the watch last reported holding; null before it has said. */
  reported: Record<string, number> | null;
  rejected: Record<string, 'full' | 'storage'>;
  /** The watch library's cap, as the watch reports it. */
  capacity: number;
  /** `sentAt` of the newest report taken, so a late queued copy is ignored. */
  reportedAt: number;
  markSent: (routeId: string, revision: number) => void;
  /** Forgets a route the phone just asked the watch to drop. */
  markRemoved: (routeId: string) => void;
  applyReport: (report: WatchRouteLibraryPayload) => void;
}

/**
 * Device-local record of the routes sent to the Apple Watch, for the "On your
 * watch" state. It is a record of what this phone did plus what the watch
 * last reported, never synced to the server: the watch belongs to the device.
 */
export const useWatchRouteStore = create<WatchRouteState>()(
  persist(
    (set, get) => ({
      sent: {},
      reported: null,
      rejected: {},
      capacity: DEFAULT_WATCH_ROUTE_CAPACITY,
      reportedAt: 0,
      markSent: (routeId, revision) =>
        set((state) => {
          const rejected = { ...state.rejected };
          delete rejected[routeId];
          return { sent: { ...state.sent, [routeId]: revision }, rejected };
        }),
      markRemoved: (routeId) =>
        set((state) => {
          const sent = { ...state.sent };
          delete sent[routeId];
          const rejected = { ...state.rejected };
          delete rejected[routeId];
          let reported = state.reported;
          if (reported && routeId in reported) {
            reported = { ...reported };
            delete reported[routeId];
          }
          return { sent, rejected, reported };
        }),
      applyReport: (report) => {
        if (report.sentAt > 0 && report.sentAt < get().reportedAt) return;
        const next = applyLibraryReport(
          {
            sent: get().sent,
            reported: get().reported,
            rejected: get().rejected,
          },
          report
        );
        set({
          reported: next.reported,
          rejected: next.rejected,
          capacity: report.capacity > 0 ? report.capacity : get().capacity,
          reportedAt: Math.max(report.sentAt, get().reportedAt),
        });
      },
    }),
    {
      name: '@SparkyFitness/watch-routes',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({
        sent: state.sent,
        reported: state.reported,
        rejected: state.rejected,
        capacity: state.capacity,
        reportedAt: state.reportedAt,
      }),
    }
  )
);
