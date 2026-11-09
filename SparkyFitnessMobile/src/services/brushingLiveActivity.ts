// Android and other platforms: no Live Activities. The iOS implementation is
// brushingLiveActivity.ios.ts.
export interface BrushingActivityState {
  running: boolean;
  targetAt: number;
  clockLabel: string;
  statusLabel: string;
  title: string;
}

export function showBrushingActivity(_state: BrushingActivityState): void {}

export function endBrushingActivity(): void {}
