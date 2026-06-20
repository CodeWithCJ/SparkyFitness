// Platform-neutral writeback entry point (iOS-resolved). iOS uses HealthKit, so
// the implementation lives in healthkit/. Metro resolves this over writeback.ts.
export { writebackPhase, runWriteback } from './healthkit/writeback';
