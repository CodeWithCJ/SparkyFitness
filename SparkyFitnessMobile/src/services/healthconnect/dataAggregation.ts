import { toLocalDateString } from '../../utils/dateUtils';

// Re-export for backward compatibility
export { toLocalDateString };

// Day-level aggregation is platform-neutral and lives in the shared module.
export { aggregateByDay } from '../shared/dataAggregation';
