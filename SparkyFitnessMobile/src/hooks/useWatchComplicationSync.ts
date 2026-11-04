import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WatchConnectivity from '../../modules/watch-connectivity';
import { sendComplicationsToWatch } from '../services/watchComplicationSync';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { resolveComplications } from '../utils/watchComplications';
import { addLog } from '../services/LogService';

/**
 * Keeps the watch's complication list the same as the phone's: sends it when
 * the app starts and whenever the wearer changes it. Until they have made
 * their own, the starter set is sent, named in the app's language. A list the
 * watch already has (same content) is not sent again on its own.
 *
 * A send can still go missing (the watch app was not running, a queued copy
 * was lost), and nothing else would put it right, so the list is also sent
 * again whenever the watch asks the phone for its state, which it does each
 * time its app opens, and when the watch becomes reachable.
 */
export function useWatchComplicationSync(enabled: boolean): void {
  const { t } = useTranslation();
  const stored = useAppPreferencesStore((s) => s.watchComplications);
  const lastSentRef = useRef<string | null>(null);
  const list = useMemo(() => resolveComplications(stored, t), [stored, t]);
  const listRef = useRef(list);

  useEffect(() => {
    listRef.current = list;
  }, [list]);

  useEffect(() => {
    if (!enabled) return;
    const signature = JSON.stringify(list);
    if (signature === lastSentRef.current) return;
    lastSentRef.current = signature;
    sendComplicationsToWatch(list).catch((error) => {
      // Sent again on the next change or launch; a failed attempt must not
      // block that by looking like it already went.
      lastSentRef.current = null;
      addLog(`[Watch Complications] Send failed: ${error}`, 'WARNING');
    });
  }, [enabled, list]);

  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const resend = () => {
      sendComplicationsToWatch(listRef.current).catch((error) => {
        addLog(`[Watch Complications] Resend failed: ${error}`, 'WARNING');
      });
    };
    const requestSub = WatchConnectivity.addListener(
      'onContextRequest',
      resend
    );
    const reachabilitySub = WatchConnectivity.addListener(
      'onReachabilityChange',
      ({ isReachable }) => {
        if (isReachable) resend();
      }
    );
    return () => {
      requestSub.remove();
      reachabilitySub.remove();
    };
  }, [enabled]);
}
