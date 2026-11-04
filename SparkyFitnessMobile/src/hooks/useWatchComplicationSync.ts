import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { sendComplicationsToWatch } from '../services/watchComplicationSync';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { resolveComplications } from '../utils/watchComplications';
import { addLog } from '../services/LogService';

/**
 * Keeps the watch's complication list the same as the phone's: sends it when
 * the app starts and whenever the wearer changes it. Until they have made
 * their own, the starter set is sent, named in the app's language. A list the
 * watch already has (same content) is not sent again within a run.
 */
export function useWatchComplicationSync(enabled: boolean): void {
  const { t } = useTranslation();
  const stored = useAppPreferencesStore((s) => s.watchComplications);
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const list = resolveComplications(stored, t);
    const signature = JSON.stringify(list);
    if (signature === lastSentRef.current) return;
    lastSentRef.current = signature;
    sendComplicationsToWatch(list).catch((error) => {
      // Sent again on the next change or launch; a failed attempt must not
      // block that by looking like it already went.
      lastSentRef.current = null;
      addLog(`[Watch Complications] Send failed: ${error}`, 'WARNING');
    });
  }, [enabled, stored, t]);
}
