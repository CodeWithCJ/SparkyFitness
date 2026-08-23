const GARMIN_SYNC_PHASES = ['health', 'activities', 'nutrition'] as const;

type GarminSyncPhase = (typeof GARMIN_SYNC_PHASES)[number];
type GarminSyncPhaseResult = Record<string, unknown> | null;
export type GarminSyncResult = Record<GarminSyncPhase, GarminSyncPhaseResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getGarminSyncPhaseErrors(result: GarminSyncResult) {
  return GARMIN_SYNC_PHASES.filter((phase) => {
    const phaseResult = result[phase];
    if (!isRecord(phaseResult)) return false;
    const hasFatalError = typeof phaseResult.error === 'string';
    const hasPartialErrors =
      Array.isArray(phaseResult.partialErrors) &&
      phaseResult.partialErrors.length > 0;
    return hasFatalError || hasPartialErrors;
  });
}

export { getGarminSyncPhaseErrors };
