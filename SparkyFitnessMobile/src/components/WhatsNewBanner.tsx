import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import { navigationRef } from './ActiveWorkoutBar';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import {
  WHATS_NEW_CONTENT_VERSION,
  getLastSeenWhatsNewVersion,
  markWhatsNewVersionSeen,
  subscribeToWhatsNewBannerReset,
} from '../services/whatsNewBanner';

// CustomTabBar's floating Add button rises 20pt above the tab bar's top edge
// (`-mt-5`). When no workout is active, this banner is the direct sibling
// above the tab bar, so it must reserve a 20pt dead strip below its content
// or the FAB will overlap the row.
const FAB_CLEARANCE = 20;

type Phase = 'evaluating' | 'eligible' | 'dismissed' | 'ineligible';

const WhatsNewBanner: React.FC = () => {
  const workoutActive = useActiveWorkoutStore((s) => s.sessionId !== null);
  const [phase, setPhase] = useState<Phase>('evaluating');
  const [resetTick, setResetTick] = useState(0);
  const contentVersion = String(WHATS_NEW_CONTENT_VERSION);

  // Dev Tools can clear `lastSeenVersion` at runtime — bump the tick so the
  // evaluation effect below re-runs and the banner can re-appear without
  // restarting the app.
  useEffect(
    () => subscribeToWhatsNewBannerReset(() => setResetTick((t) => t + 1)),
    [],
  );

  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  useEffect(() => {
    setPhase('evaluating');
    let cancelled = false;
    void (async () => {
      const lastSeen = await getLastSeenWhatsNewVersion();
      if (cancelled) return;
      if (lastSeen === contentVersion) {
        setPhase('ineligible');
        return;
      }
      // Pre-marker builds stamped the app version here (e.g. "1.4.0"); markers
      // are plain integers, so a "." means this user has already seen the
      // current cards. Migrate their stamp (so future content bumps still reach
      // them) and suppress this time.
      if (lastSeen?.includes('.')) {
        void markWhatsNewVersionSeen(contentVersion);
        setPhase('ineligible');
        return;
      }
      // A null lastSeen means this user is upgrading from a pre-banner build.
      // Fresh installs are stamped via `markCurrentVersionSeen` on onboarding
      // completion, so by the time the banner mounts on Tabs, null can only
      // mean an in-place upgrade — show the banner.
      setPhase('eligible');
    })();
    return () => {
      cancelled = true;
    };
  }, [contentVersion, resetTick]);

  // Mark the version seen as soon as the banner actually renders — a banner
  // the user ignores still consumes the prompt, so we don't re-pester next
  // launch. Skipped while a workout is active so launching with an in-flight
  // workout doesn't burn the prompt without ever displaying.
  const shouldRender = phase === 'eligible' && !workoutActive;
  useEffect(() => {
    if (shouldRender) {
      void markWhatsNewVersionSeen(contentVersion);
    }
  }, [shouldRender, contentVersion]);

  if (!shouldRender) return null;

  const handleTap = () => {
    setPhase('dismissed');
    if (navigationRef.isReady()) {
      navigationRef.navigate('WhatsNew');
    }
  };

  const handleDismiss = () => setPhase('dismissed');

  return (
    <View
      className="bg-chrome border-t border-chrome-border"
      style={{ paddingBottom: FAB_CLEARANCE }}
    >
      <Pressable
        onPress={handleTap}
        accessibilityRole="button"
        accessibilityLabel="See what's new in this update"
        className="flex-row items-center px-4 py-3"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-primary/15">
          <Icon name="sparkle" size={20} color={accentPrimary} weight="bold" />
        </View>
        <View className="flex-1 px-3">
          <Text className="text-sm font-semibold text-text-primary">
            What&apos;s new
          </Text>
          <Text numberOfLines={1} className="text-xs text-text-secondary">
            See what&apos;s improved in this update
          </Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          className="p-2"
        >
          <Icon name="close" size={20} color={textMuted} weight="bold" />
        </Pressable>
      </Pressable>
    </View>
  );
};

export default WhatsNewBanner;
