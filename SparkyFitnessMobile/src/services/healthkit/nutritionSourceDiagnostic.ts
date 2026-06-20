import {
  queryCorrelationSamples,
  queryQuantitySamples,
} from '@kingstinct/react-native-healthkit';
import { addLog } from '../LogService';
import { DIETARY_WRITE_IDENTIFIERS } from './writebackMappers';

// ============================================================================
// Dev-only nutrition source diagnostic (Phase 0 de-risking probe)
// ============================================================================
//
// Confirms on a real device that reading Food *correlations only* covers the dietary
// data other apps log — i.e. that loose (uncorrelated) dietary samples are negligible —
// before we ship the correlation-only nutrition read. Shares the same correlation query
// and contained-sample-UUID dedup the real read uses, so it is a throwaway probe: once
// the gate is confirmed it can be deleted along with its DevTools button.

const DAY_MS = 86_400_000;

interface SampleLike {
  uuid?: string;
  quantityType?: string;
  unit?: string;
  startDate?: string | Date;
  sourceRevision?: { source?: { bundleIdentifier?: string } };
}

const bundleIdOf = (s: SampleLike): string =>
  s.sourceRevision?.source?.bundleIdentifier ?? 'unknown';

const toIso = (d: string | Date | undefined): string =>
  d == null ? 'unknown' : typeof d === 'string' ? d : new Date(d).toISOString();

const increment = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

export interface NutritionSourceDiagnostic {
  windowDays: number;
  correlationCount: number;
  /** Distinct contained dietary sample UUIDs across all Food correlations. */
  containedSampleCount: number;
  correlationsBySource: Record<string, number>;
  /** Dietary samples in the window NOT contained in any Food correlation. */
  looseTotal: number;
  looseBySource: Record<string, number>;
  looseByIdentifier: Record<string, number>;
  /** Per source: how many distinct (source, event-instant) clusters the loose samples form,
   *  and how many samples total. clusters ≈ food count and samples/clusters ≈ nutrient count
   *  confirms "one food = one shared timestamp" — the grouping key the loose read relies on. */
  looseClustersBySource: Record<string, { clusters: number; samples: number }>;
  /** Distinct units HealthKit returned per dietary identifier (unit-awareness check). */
  unitsByIdentifier: Record<string, string[]>;
}

/**
 * Probe how much dietary data lives in Food correlations vs. loose samples.
 *
 * Decision gate: looseTotal ≈ 0 → correlation-only read is sufficient. A specific app
 * dominating looseBySource means it logs uncorrelated samples and would need a targeted
 * fallback (out of v1 scope). unitsByIdentifier surfacing kJ/oz/etc. confirms the read
 * mapper must be unit-aware.
 */
export const diagnoseNutritionSources = async (
  windowDays = 14,
): Promise<NutritionSourceDiagnostic> => {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - windowDays * DAY_MS);
  const dateFilter = { date: { startDate, endDate } };

  // 1. Food correlations: collect contained-sample UUIDs + per-source counts.
  const correlations = await queryCorrelationSamples('HKCorrelationTypeIdentifierFood', {
    filter: dateFilter,
    limit: 0,
    ascending: false,
  });

  const correlationUuids = new Set<string>();
  const correlationsBySource: Record<string, number> = {};
  const unitsByIdentifier: Record<string, Set<string>> = {};

  for (const correlation of correlations) {
    increment(correlationsBySource, bundleIdOf(correlation as SampleLike));
    const objects = (correlation as unknown as { objects?: SampleLike[] }).objects ?? [];
    for (const obj of objects) {
      if (obj.uuid) correlationUuids.add(obj.uuid);
      if (typeof obj.quantityType === 'string' && obj.unit) {
        (unitsByIdentifier[obj.quantityType] ??= new Set<string>()).add(obj.unit);
      }
    }
  }

  // 2. Loose dietary samples: per identifier, count samples whose UUID is not contained
  //    in any Food correlation, broken down by source.
  const looseBySource: Record<string, number> = {};
  const looseByIdentifier: Record<string, number> = {};
  // Per (source|event-instant) cluster: sample count + the source it belongs to.
  const clusterSamples = new Map<string, number>();
  const clusterSource = new Map<string, string>();
  let looseTotal = 0;

  for (const identifier of DIETARY_WRITE_IDENTIFIERS) {
    const samples = await queryQuantitySamples(
      identifier as Parameters<typeof queryQuantitySamples>[0],
      { filter: dateFilter, limit: 0, ascending: false },
    );
    for (const sample of samples as unknown as SampleLike[]) {
      if (sample.unit) {
        (unitsByIdentifier[identifier] ??= new Set<string>()).add(sample.unit);
      }
      if (sample.uuid && !correlationUuids.has(sample.uuid)) {
        looseTotal++;
        increment(looseByIdentifier, identifier);
        const source = bundleIdOf(sample);
        increment(looseBySource, source);
        const key = `${source}|${toIso(sample.startDate)}`;
        clusterSamples.set(key, (clusterSamples.get(key) ?? 0) + 1);
        clusterSource.set(key, source);
      }
    }
  }

  const looseClustersBySource: Record<string, { clusters: number; samples: number }> = {};
  for (const [key, count] of clusterSamples) {
    const source = clusterSource.get(key) ?? 'unknown';
    const agg = (looseClustersBySource[source] ??= { clusters: 0, samples: 0 });
    agg.clusters += 1;
    agg.samples += count;
  }

  const unitsAsArrays: Record<string, string[]> = {};
  for (const [identifier, units] of Object.entries(unitsByIdentifier)) {
    unitsAsArrays[identifier] = Array.from(units);
  }

  const summary: NutritionSourceDiagnostic = {
    windowDays,
    correlationCount: correlations.length,
    containedSampleCount: correlationUuids.size,
    correlationsBySource,
    looseTotal,
    looseBySource,
    looseByIdentifier,
    looseClustersBySource,
    unitsByIdentifier: unitsAsArrays,
  };

  addLog(
    `[NutritionDiagnostic] ${windowDays}d window: ${summary.correlationCount} food correlations ` +
      `(${summary.containedSampleCount} contained samples), ${summary.looseTotal} loose dietary samples`,
    'INFO',
    [
      `Correlations by source: ${JSON.stringify(correlationsBySource)}`,
      `Loose total: ${looseTotal}`,
      `Loose by source: ${JSON.stringify(looseBySource)}`,
      `Loose clusters by source: ${JSON.stringify(looseClustersBySource)}`,
      `Loose by identifier: ${JSON.stringify(looseByIdentifier)}`,
      `Units by identifier: ${JSON.stringify(unitsAsArrays)}`,
    ],
  );

  return summary;
};
