import { createContext } from 'react';
import type { View } from 'react-native';

/**
 * Where the focus view's current-set card (or the rest card while resting)
 * attaches its ref, so the page can scroll it into view.
 */
export const FocusScrollTargetContext =
  createContext<React.RefObject<View | null> | null>(null);
