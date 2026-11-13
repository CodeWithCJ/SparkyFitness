/**
 * Whether the active-workout header moves up into the status-bar row. That is
 * the iPhone Duo's unfolded portrait pose, where the status cluster sits beside
 * the header and the top inset would only waste a row. iOS only: Android has a
 * top inset too, and on a foldable or tablet that is 600 dp wide the header
 * would land under the system status bar.
 */
export function shouldPlaceHeaderInStatusRow({
  os,
  railBeside,
  topInset,
  windowWidth,
}: {
  os: string;
  railBeside: boolean;
  topInset: number;
  windowWidth: number;
}): boolean {
  return os === 'ios' && !railBeside && topInset > 0 && windowWidth >= 600;
}
