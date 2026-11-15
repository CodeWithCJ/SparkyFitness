/**
 * Case-insensitive match of a raw cell value against a dropdown's options,
 * returning the canonical option string (or '' when nothing matches).
 *
 * Radix `Select` matches its controlled `value` against each `SelectItem` by
 * strict case equality, so a CSV cell like `Lunch` never highlights a
 * lowercase `lunch` option. The server already matches these values
 * case-insensitively on submit, so this is purely a display/usability fix:
 * it lets the dropdown highlight the right option for an incoming value whose
 * case differs from the option list.
 */
export function matchDropdownValue(
  rawValue: string | undefined,
  options: string[]
): string {
  const trimmed = (rawValue ?? '').trim();
  if (!trimmed) return '';
  const match = options.find(
    (o) => o.trim().toLowerCase() === trimmed.toLowerCase()
  );
  return match ? match : '';
}
