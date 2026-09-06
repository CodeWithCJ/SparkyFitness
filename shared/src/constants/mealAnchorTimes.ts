/**
 * Representative local time for each built-in meal type, as "HH:MM".
 *
 * meal_types.default_time is nullable and ships NULL, so anything that needs to
 * place a meal on the clock has to supply its own anchor. Mobile's HealthKit and
 * Health Connect writeback already each carry a private copy of this map to give
 * a food entry an instant; this is the shared source they and the server agree on.
 *
 * Used by the server to decide which meal a drink logged "now" belongs to when a
 * linked water container has no meal type pinned (#2115), and by writeback to
 * order a day's records sensibly.
 *
 * Keys are the built-in meal type names, lowercased. A custom meal type has no
 * entry here and must rely on its own default_time.
 */
export const DEFAULT_MEAL_ANCHOR_TIMES: Readonly<Record<string, string>> = {
  breakfast: "08:00",
  lunch: "12:30",
  snacks: "15:00",
  dinner: "19:00",
};
