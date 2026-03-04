export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;

  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return String(error);
};

export const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;
