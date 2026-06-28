import React, { useEffect, useRef } from 'react';
import { useTransitionProgress } from 'react-native-screens';

import { notifyActiveWorkoutBarStackTransition } from './ActiveWorkoutBar';
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
  const triggeredRef = useRef(false);

  useEffect(() => {
    const reset = () => {
      if (triggeredRef.current) {
        notifyActiveWorkoutBarStackTransition('end', false, 0);
      }
      triggeredRef.current = false;
      progressValueRef.current = null;
      startProgressRef.current = null;
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
      }

      const startProgress = startProgressRef.current ?? currentProgress;
      notifyActiveWorkoutBarStackTransition(
        'start',
        true,
        getTabRevealProgress(startProgress, currentProgress),
      );
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
