// The shape a helper needs from i18next's `t` when it is handed one as an
// argument. Two overloads rather than one optional `options`, because
// i18next's own `t` (whose overloads need options to be present when passed)
// does not fit a single optional-options signature on i18next 27.
export type TranslateFn = {
  (key: string): string;
  (key: string, options: Record<string, unknown>): string;
};
