import React, { useEffect, useRef } from 'react';
import { useTransitionProgress } from 'react-native-screens';

import {
  notifyActiveWorkoutBarStackTransition,
  notifyActiveWorkoutBarSwipeProgress,
} from './ActiveWorkoutBar';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';

const NON_INTERACTIVE_BACK_ROUTES = new Set(['Tabs', 'Onboarding']);

function getTabRevealProgress(startProgress: number, currentProgress: number) {
  if (startProgress > 0.5) {
    return (startProgress - currentProgress) / startProgress;
  }
  return (currentProgress - startProgress) / (1 - startProgress);
}

function ActiveWorkoutTransitionProgressProbe({
  enabled,
}: {
  enabled: boolean;
}) {
  const usesNativeTabs = useNativeIOSTabsActive();
  const transition = useTransitionProgress() as
    | ReturnType<typeof useTransitionProgress>
    | null
    | undefined;
  const closing = transition?.closing;
  const progress = transition?.progress;
  const closingValueRef = useRef(0);
  const progressValueRef = useRef<number | null>(null);
  const startProgressRef = useRef<number | null>(null);
  const revealProgressRef = useRef(0);
  const triggeredRef = useRef(false);

  useEffect(() => {
    const reset = () => {
      triggeredRef.current = false;
      progressValueRef.current = null;
      startProgressRef.current = null;
      revealProgressRef.current = 0;
    };

    if (!enabled || !usesNativeTabs || closing == null || progress == null) {
      reset();
      return;
    }

    const maybeNotifyClosing = () => {
      const currentProgress = progressValueRef.current;
      if (closingValueRef.current <= 0.5 || currentProgress == null) {
        reset();
        return;
      }

      if (!triggeredRef.current) {
        triggeredRef.current = true;
        startProgressRef.current = currentProgress;
        notifyActiveWorkoutBarStackTransition('start', true);
      }

      const startProgress = startProgressRef.current ?? currentProgress;
      const revealProgress = getTabRevealProgress(startProgress, currentProgress);
      revealProgressRef.current = revealProgress;
      notifyActiveWorkoutBarSwipeProgress(revealProgress);
    };

    const closingListener = closing.addListener(({ value }) => {
      closingValueRef.current = value;
      maybeNotifyClosing();
    });
    const progressListener = progress.addListener(({ value }) => {
      progressValueRef.current = value;
      maybeNotifyClosing();
    });

    return () => {
      closing.removeListener(closingListener);
      progress.removeListener(progressListener);
    };
  }, [closing, enabled, progress, usesNativeTabs]);

  return null;
}

export function ActiveWorkoutTransitionScreenLayout({
  children,
  routeName,
}: {
  children: React.ReactNode;
  routeName: string;
}) {
  const canProbeInteractiveBack = !NON_INTERACTIVE_BACK_ROUTES.has(routeName);

  return (
    <>
      <ActiveWorkoutTransitionProgressProbe enabled={canProbeInteractiveBack} />
      {children}
    </>
  );
}
