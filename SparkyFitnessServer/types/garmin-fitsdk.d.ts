/**
 * Minimal ambient types for '@garmin/fitsdk'. The SDK ships full .d.ts files,
 * but their extensionless relative imports do not resolve under NodeNext, so
 * the package surfaces no members to tsc. Only the API this codebase uses is
 * declared here; extend as needed. Timestamps decode to Date by default, but
 * localDateTime fields (e.g. activity.localTimestamp) stay raw FIT-epoch
 * seconds, hence `number | Date`.
 */
declare module '@garmin/fitsdk' {
  type FitDateTime = number | Date;

  export interface FileIdMesg {
    type?: string | number;
    manufacturer?: string | number;
    product?: number;
    serialNumber?: number;
    timeCreated?: FitDateTime;
    productName?: string;
  }

  export interface SportMesg {
    sport?: string | number;
    subSport?: string | number;
    name?: string;
  }

  export interface SessionMesg {
    timestamp?: FitDateTime;
    startTime?: FitDateTime;
    totalElapsedTime?: number;
    totalTimerTime?: number;
    totalDistance?: number;
    totalCycles?: number;
    totalStrides?: number;
    totalCalories?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    avgCadence?: number;
    maxCadence?: number;
    avgSpeed?: number;
    maxSpeed?: number;
    enhancedAvgSpeed?: number;
    enhancedMaxSpeed?: number;
    totalAscent?: number;
    totalDescent?: number;
    sport?: string | number;
    subSport?: string | number;
    sportProfileName?: string;
    messageIndex?: number;
    firstLapIndex?: number;
    numLaps?: number;
    event?: string | number;
    eventType?: string | number;
    [key: string]: unknown;
  }

  export interface ActivityMesg {
    timestamp?: FitDateTime;
    localTimestamp?: FitDateTime;
    totalTimerTime?: number;
    numSessions?: number;
    type?: string | number;
    event?: string | number;
    eventType?: string | number;
  }

  export interface RecordMesg {
    timestamp?: FitDateTime;
    positionLat?: number;
    positionLong?: number;
    altitude?: number;
    enhancedAltitude?: number;
    heartRate?: number;
    cadence?: number;
    fractionalCadence?: number;
    distance?: number;
    speed?: number;
    enhancedSpeed?: number;
    [key: string]: unknown;
  }

  export interface LapMesg {
    timestamp?: FitDateTime;
    startTime?: FitDateTime;
    totalElapsedTime?: number;
    totalTimerTime?: number;
    totalDistance?: number;
    totalCalories?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    avgCadence?: number;
    maxCadence?: number;
    avgSpeed?: number;
    maxSpeed?: number;
    enhancedAvgSpeed?: number;
    enhancedMaxSpeed?: number;
    totalAscent?: number;
    totalDescent?: number;
    messageIndex?: number;
    event?: string | number;
    eventType?: string | number;
    [key: string]: unknown;
  }

  export interface TimeInZoneMesg {
    timestamp?: FitDateTime;
    referenceMesg?: string | number;
    referenceIndex?: number;
    timeInHrZone?: number[];
    hrZoneHighBoundary?: number[];
    maxHeartRate?: number;
    restingHeartRate?: number;
  }

  export interface SetMesg {
    timestamp?: FitDateTime;
    [key: string]: unknown;
  }

  export interface FitMessages {
    fileIdMesgs?: FileIdMesg[];
    sportMesgs?: SportMesg[];
    sessionMesgs?: SessionMesg[];
    activityMesgs?: ActivityMesg[];
    lapMesgs?: LapMesg[];
    recordMesgs?: RecordMesg[];
    timeInZoneMesgs?: TimeInZoneMesg[];
    setMesgs?: SetMesg[];
    [key: string]: unknown;
  }

  export class Stream {
    static fromBuffer(buffer: Uint8Array): Stream;
    static fromByteArray(data: number[] | Uint8Array): Stream;
    static fromArrayBuffer(buffer: ArrayBuffer): Stream;
  }

  export class Decoder {
    constructor(stream: Stream);
    static isFIT(stream: Stream): boolean;
    isFIT(): boolean;
    checkIntegrity(): boolean;
    read(options?: Record<string, unknown>): {
      messages: FitMessages;
      errors: Error[];
    };
  }

  export class Encoder {
    writeMesg(mesg: { mesgNum: number } & Record<string, unknown>): this;
    close(): Uint8Array;
  }

  export const Profile: {
    MesgNum: Record<string, number>;
  };

  export const Utils: {
    FIT_EPOCH_MS: number;
    convertDateToDateTime(date: Date): number;
    convertDateTimeToDate(datetime: number): Date;
  };
}
