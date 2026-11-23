import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Widest a screen's content grows on a large window (iPad, Split View,
 * Stage Manager, Android tablets). Every phone is narrower, so phones keep
 * their full-width layout. The screen background stays full width because the
 * navigator's `contentStyle` paints it behind this column.
 */
export const READABLE_CONTENT_MAX_WIDTH = 720;

/** The Dashboard is a grid of cards, so it may use more of the width. */
export const DASHBOARD_CONTENT_MAX_WIDTH = 1100;

/** Window width from which the Dashboard lays its cards out in two columns. */
export const DASHBOARD_TWO_COLUMN_MIN_WIDTH = 900;

// Routes that draw edge to edge: the tab container (its screens apply the
// column themselves), cameras, maps and photo players.
const FULL_BLEED_ROUTES = new Set([
  'Tabs',
  'FoodScan',
  'ActionTagScan',
  'RecordActivity',
  'RouteDraw',
  'RouteGenerate',
  'ProgressPhotoCompare',
  'ProgressPhotoTimelapse',
  'WatchRunLive',
]);

const WIDE_ROUTES = new Set(['DashboardRoot', 'Dashboard']);

/** The column width for a route, or `null` when it draws edge to edge. */
export function readableMaxWidthForRoute(routeName: string): number | null {
  if (FULL_BLEED_ROUTES.has(routeName)) return null;
  if (WIDE_ROUTES.has(routeName)) return DASHBOARD_CONTENT_MAX_WIDTH;
  return READABLE_CONTENT_MAX_WIDTH;
}

/**
 * Navigator `screenLayout` wrapper that centres a screen in a column no wider
 * than its route allows. It is always mounted (never swapped in by window
 * width), so rotating or resizing the window never remounts the screen.
 */
export function ReadableWidthLayout({
  routeName,
  children,
}: {
  routeName: string;
  children: React.ReactNode;
}) {
  const maxWidth = readableMaxWidthForRoute(routeName);
  if (maxWidth === null) return <>{children}</>;
  return <View style={[styles.column, { maxWidth }]}>{children}</View>;
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
});
