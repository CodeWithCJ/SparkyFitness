export type SyncDuration = 'today' | '24h' | '3d' | '7d' | '30d' | '90d';

// SyncInterval represents how often to sync (background sync frequency)
// Note: '24h' appears in both types - SyncDuration for data range, SyncInterval for frequency
export type SyncInterval = '1h' | '4h' | '24h';

/**
 * Calculates the start date for a sync operation based on the specified duration.
 * For 'today', returns midnight of the current day.
 * For '24h', returns exactly 24 hours ago (rolling window).
 * For other durations, returns midnight of the calculated start day.
 */
export const getSyncStartDate = (duration: SyncDuration): Date => {
  const now = new Date();
  let startDate = new Date(now);

  switch (duration) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case '24h':
      // True rolling 24h window - exactly 24 hours ago
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '3d':
      startDate.setDate(now.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 89);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }
  return startDate;
};
