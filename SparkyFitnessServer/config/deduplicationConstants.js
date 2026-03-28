'use strict';

// Thresholds used for cross-source workout deduplication.
// Two exercise entries from different sources are considered the same session when:
//   - their start times differ by at most MAX_START_TIME_DIFF_SECONDS, AND
//   - the shorter duration is at least MIN_DURATION_SIMILARITY_RATIO of the longer one.
const CROSS_SOURCE_DEDUP = Object.freeze({
  MAX_START_TIME_DIFF_SECONDS: 600,
  MIN_DURATION_SIMILARITY_RATIO: 0.8,
});

module.exports = { CROSS_SOURCE_DEDUP };
