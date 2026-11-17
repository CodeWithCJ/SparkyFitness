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

// The connection-level codes formatGarminMicroserviceError puts in a phase's
// error text when the microservice could not be reached at all.
const UNREACHABLE_CODES = /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/;

/** Whether a failed phase says the Garmin microservice was not reachable. */
function isGarminServiceUnreachable(result: GarminSyncResult): boolean {
  return getGarminSyncPhaseErrors(result).some((phase) => {
    const phaseResult = result[phase];
    if (!isRecord(phaseResult)) return false;
    const messages = [
      phaseResult.error,
      ...(Array.isArray(phaseResult.partialErrors)
        ? phaseResult.partialErrors
        : []),
    ];
    return messages.some(
      (message) =>
        typeof message === 'string' && UNREACHABLE_CODES.test(message)
    );
  });
}

export { getGarminSyncPhaseErrors, isGarminServiceUnreachable };
