import React from 'react';
import { useScreenHeader, type ScreenHeaderConfig } from '../hooks/useScreenHeader';

/**
 * Declarative wrapper around `useScreenHeader`. Renders the custom-path bar on
 * the fallback paths and `null` on the native path (where the hook has already
 * mirrored the descriptor into the native stack header). Prefer the hook
 * directly when a screen needs to interleave `{header}` with other content.
 */
const ScreenHeader: React.FC<ScreenHeaderConfig> = (config) => {
  return <>{useScreenHeader(config)}</>;
};

export default ScreenHeader;
