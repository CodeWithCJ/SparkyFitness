import { createContext, useContext } from 'react';

/**
 * True while the focus view's rest timer runs: logging a new set is blocked
 * until the rest is skipped or ends. Un-logging, editing, adding and deleting
 * stay available. Defaults to false so surfaces outside the focus view never
 * lock.
 */
export const FocusLogLockContext = createContext(false);

export const useFocusLogLocked = () => useContext(FocusLogLockContext);

/** Opacity for a log control that is locked. */
export const LOG_LOCKED_OPACITY = 0.4;
