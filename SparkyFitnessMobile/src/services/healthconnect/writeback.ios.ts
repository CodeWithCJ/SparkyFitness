// iOS no-op: Health Connect writeback is Android-only. Mirrors the platform-split
// convention so cross-platform callers can import { writebackPhase } unconditionally.
//
// To add HealthKit writeback: implement these here using a healthkit/ mapper
// (parallel to healthconnect/writebackMappers.ts). Note: HealthKit has no
// clientRecordId — dedupe by tracking saved sample UUIDs instead.
export const writebackPhase = async (_dates: string[]): Promise<boolean> => true;

export const runWriteback = async (): Promise<void> => {};
