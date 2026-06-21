// Platform-neutral writeback entry point (Android-resolved). Metro picks the
// `.ios.ts` sibling on iOS automatically. The platform decision lives here, at the
// top-level services/ folder, so each platform's writeback implementation stays in
// its own folder (healthconnect/ vs healthkit/) — mirroring how
// healthConnectService.ts / .ios.ts already split.
export { writebackPhase, runWriteback, removeAllWrittenData } from './healthconnect/writeback';
