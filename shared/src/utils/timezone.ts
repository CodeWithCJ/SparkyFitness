// ---------------------------------------------------------------------------
// Day string operations (no timezone needed)
// ---------------------------------------------------------------------------

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns true if `value` is a valid YYYY-MM-DD date string. */
export function isDayString(value: string): boolean {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Use UTC Date to validate the actual day (e.g. Feb 30)
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Returns the day of week for a YYYY-MM-DD string.
 * 0 = Sunday, 1 = Monday, ... 6 = Saturday.
 * Uses Sakamoto's algorithm -- no Date object needed.
 */
export function dayOfWeek(day: string): number {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day string: ${day}`);
  let y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (month < 3) y -= 1;
  return (
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      t[month - 1]! +
      d) %
    7
  );
}

/** Add (or subtract) `n` days to a YYYY-MM-DD string. Returns a new YYYY-MM-DD string. */
export function addDays(day: string, n: number): string {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day string: ${day}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + n);
  return formatUtcDate(d);
}

/** Lexicographic comparison of two YYYY-MM-DD strings. Returns -1, 0, or 1. */
export function compareDays(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Convert a YYYY-MM-DD string to a local-midnight Date for calendar/date-picker widgets. */
export function dayToPickerDate(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day string: ${day}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Convert a local Date to a YYYY-MM-DD string using local getters. */
export function localDateToDay(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Whole-day count from `a` to `b` (b - a). Negative if b precedes a. */
export function daysBetween(a: string, b: string): number {
  const ma = DAY_RE.exec(a);
  const mb = DAY_RE.exec(b);
  if (!ma || !mb) throw new Error(`Invalid day string: ${a} / ${b}`);
  const ua = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const ub = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((ub - ua) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Timezone-aware operations
// ---------------------------------------------------------------------------

/** Returns true if `tz` is a valid IANA timezone identifier. */
export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns today's date as YYYY-MM-DD in the given timezone.
 */
export function todayInZone(tz: string): string {
  return instantToDay(new Date(), tz);
}

/**
 * Converts an arbitrary instant to a YYYY-MM-DD string in the given timezone.
 *
 * Assembles the string from `formatToParts` rather than relying on a locale
 * (e.g. 'en-CA') to imply YYYY-MM-DD ordering. Some runtimes — notably Firefox
 * on Linux, which applies OS regional preferences to explicitly-requested
 * locales — format 'en-CA' as MM/DD/YYYY, which would leak a non-ISO date into
 * API params and date parsing. Reading named parts is ordering-independent.
 */
export function instantToDay(ts: Date | string | number, tz: string): string {
  const date = ts instanceof Date ? ts : new Date(ts);
  const parts = Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  let year = "";
  let month = "";
  let day = "";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    if (p.type === "month") month = p.value;
    if (p.type === "day") day = p.value;
  }
  return `${year}-${month}-${day}`;
}

/** Returns the current hour and minute in the given timezone. */
export function userHourMinute(tz: string): { hour: number; minute: number } {
  return instantHourMinute(new Date(), tz);
}

/** Returns the hour and minute of an instant in the given timezone. */
export function instantHourMinute(
  ts: Date | string | number,
  tz: string,
): { hour: number; minute: number } {
  const date = ts instanceof Date ? ts : new Date(ts);
  const parts = Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = Number(p.value);
    if (p.type === "minute") minute = Number(p.value);
  }
  // hour12:false can return 24 for midnight in some engines
  if (hour === 24) hour = 0;
  return { hour, minute };
}

/**
 * Returns the half-open UTC range `[start, end)` for a calendar day in the given timezone.
 *
 * For example, `dayToUtcRange('2024-03-10', 'America/New_York')` returns the UTC
 * instants corresponding to midnight-to-midnight in Eastern time on that day
 * (which spans a DST transition).
 *
 * Implementation: use `Intl.DateTimeFormat.formatToParts` to find the UTC offset
 * at the target day's midnight, then construct exact UTC instants.
 */
export function dayToUtcRange(
  day: string,
  tz: string,
): { start: Date; end: Date } {
  const start = midnightUtcInstant(day, tz);
  const nextDay = addDays(day, 1);
  const end = midnightUtcInstant(nextDay, tz);
  return { start, end };
}

/** Returns the half-open UTC range for a range of calendar days `[startDay, endDay]` inclusive. */
export function dayRangeToUtcRange(
  startDay: string,
  endDay: string,
  tz: string,
): { start: Date; end: Date } {
  const start = midnightUtcInstant(startDay, tz);
  const end = midnightUtcInstant(addDays(endDay, 1), tz);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Fixed-offset operations (for Health Connect UTC offsets)
// ---------------------------------------------------------------------------

/** Converts an instant to a YYYY-MM-DD string using a fixed UTC offset in minutes. */
export function instantToDayWithOffset(
  ts: Date | string | number,
  offsetMinutes: number,
): string {
  const date = ts instanceof Date ? ts : new Date(ts);
  const localMs = date.getTime() + offsetMinutes * 60_000;
  return formatUtcDate(new Date(localMs));
}

/** Returns the hour and minute of an instant using a fixed UTC offset in minutes. */
export function instantHourMinuteWithOffset(
  ts: Date | string | number,
  offsetMinutes: number,
): { hour: number; minute: number } {
  const date = ts instanceof Date ? ts : new Date(ts);
  const localMs = date.getTime() + offsetMinutes * 60_000;
  const local = new Date(localMs);
  return { hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Find the UTC instant corresponding to midnight (00:00) of `day` in timezone `tz`.
 *
 * Strategy — two-pass offset resolution:
 * 1. Guess UTC midnight of the calendar date and sample the tz offset there.
 * 2. Compute a candidate result using that offset.
 * 3. Re-sample the offset at the *candidate* instant. If it differs (the offset
 *    changed between the guess and actual midnight — e.g. Australia/Lord_Howe),
 *    recompute with the corrected offset.
 * 4. If DST spring-forward means midnight doesn't exist, the result is the
 *    first valid instant of that day (e.g. 01:00 local → the gap is skipped).
 */
function midnightUtcInstant(day: string, tz: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day string: ${day}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const dayNum = Number(m[3]);

  const fmt = Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const targetMidnightUtcMs = Date.UTC(year, month - 1, dayNum, 0, 0);

  // Sample the UTC offset (in ms) at a given instant
  function offsetAt(utcMs: number): number {
    const parts = fmt.formatToParts(new Date(utcMs));
    const pv = (type: string) => {
      const p = parts.find((p) => p.type === type);
      return p ? Number(p.value) : 0;
    };
    let h = pv("hour");
    if (h === 24) h = 0;
    const localAsUtcMs = Date.UTC(
      pv("year"),
      pv("month") - 1,
      pv("day"),
      h,
      pv("minute"),
    );
    return localAsUtcMs - utcMs;
  }

  // Pass 1: offset at UTC midnight of the target date
  const offset1 = offsetAt(targetMidnightUtcMs);
  let resultMs = targetMidnightUtcMs - offset1;

  // Pass 2: offset at the candidate result may differ (e.g. DST changed between
  // UTC midnight and local midnight). If so, recompute with the corrected offset.
  const offset2 = offsetAt(resultMs);
  if (offset2 !== offset1) {
    resultMs = targetMidnightUtcMs - offset2;
  }

  // Verify: the result should map to the target day in the target tz.
  // If DST spring-forward skips midnight, adjust forward to the first valid instant.
  const checkParts = fmt.formatToParts(new Date(resultMs));
  const checkDay = Number(checkParts.find((p) => p.type === "day")!.value);
  const checkMonth = Number(checkParts.find((p) => p.type === "month")!.value);

  if (checkDay !== dayNum || checkMonth !== month) {
    for (let bump = 15 * 60_000; bump <= 120 * 60_000; bump += 15 * 60_000) {
      const tryParts = fmt.formatToParts(new Date(resultMs + bump));
      const tryDay = Number(tryParts.find((p) => p.type === "day")!.value);
      const tryMonth = Number(tryParts.find((p) => p.type === "month")!.value);
      if (tryDay === dayNum && tryMonth === month) {
        resultMs = resultMs + bump;
        break;
      }
    }
  }

  return new Date(resultMs);
}

/**
 * Calculate age in years from a YYYY-MM-DD string, respecting a given timezone.
 * If timezone is not provided, defaults to local time.
 */
export function calculateAge(dob: string, tz?: string): number {
  if (!dob) return 0;

  const targetTz =
    tz && isValidTimeZone(tz)
      ? tz
      : typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC";

  const todayStr = todayInZone(targetTz);
  const todayParts = todayStr.split("-");
  const todayYear = parseInt(todayParts[0] || "0", 10);
  const todayMonth = parseInt(todayParts[1] || "0", 10);
  const todayDay = parseInt(todayParts[2] || "0", 10);

  const dobParts = dob.split("-");
  const dobYear = parseInt(dobParts[0] || "0", 10);
  const dobMonth = parseInt(dobParts[1] || "0", 10);
  const dobDay = parseInt(dobParts[2] || "0", 10);

  let age = todayYear - dobYear;
  if (todayMonth < dobMonth || (todayMonth === dobMonth && todayDay < dobDay)) {
    age--;
  }
  return age;
}

/**
 * Parses a local datetime string (e.g. "YYYY-MM-DDTHH:mm") in a given timezone and returns a UTC Date.
 */
export function localDateTimeToUtc(localDateTimeStr: string, tz: string): Date {
  const [datePart, timePart] = localDateTimeStr.split("T");
  if (!datePart || !timePart) return new Date(localDateTimeStr);

  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (
    year == null ||
    month == null ||
    day == null ||
    hour == null ||
    minute == null
  ) {
    return new Date(localDateTimeStr);
  }

  const fmt = Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const targetLocalUtcMs = Date.UTC(year, month - 1, day, hour, minute);

  function offsetAt(utcMs: number): number {
    const parts = fmt.formatToParts(new Date(utcMs));
    const pv = (type: string) => {
      const p = parts.find((p) => p.type === type);
      return p ? Number(p.value) : 0;
    };
    let h = pv("hour");
    if (h === 24) h = 0;
    const localAsUtcMs = Date.UTC(
      pv("year"),
      pv("month") - 1,
      pv("day"),
      h,
      pv("minute"),
    );
    return localAsUtcMs - utcMs;
  }

  const offset1 = offsetAt(targetLocalUtcMs);
  let resultMs = targetLocalUtcMs - offset1;

  const offset2 = offsetAt(resultMs);
  if (offset2 !== offset1) {
    resultMs = targetLocalUtcMs - offset2;
  }

  return new Date(resultMs);
}

/**
 * Formats a UTC instant as a `YYYY-MM-DDTHH:mm` string in the given timezone, suitable
 * for a `datetime-local` input value. Inverse of {@link localDateTimeToUtc}. Uses
 * hourCycle 'h23' so midnight renders as `00`, not `24`. Returns '' on invalid input.
 */
export function utcToLocalDateTimeInput(iso: string, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    const time = `${get("hour")}:${get("minute")}`;
    return date.includes("NaN") || time.includes("NaN")
      ? ""
      : `${date}T${time}`;
  } catch {
    return "";
  }
}
