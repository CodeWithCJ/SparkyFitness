export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  if (error !== null && typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    if (
      typeof errObj['message'] === 'string' &&
      errObj['message'].trim() !== ''
    ) {
      return errObj['message'];
    }
    if (typeof errObj['error'] === 'string' && errObj['error'].trim() !== '') {
      return errObj['error'];
    }
    if (errObj['error'] !== null && typeof errObj['error'] === 'object') {
      const nestedErr = errObj['error'] as Record<string, unknown>;
      if (
        typeof nestedErr['message'] === 'string' &&
        nestedErr['message'].trim() !== ''
      ) {
        return nestedErr['message'];
      }
      if (
        typeof nestedErr['statusText'] === 'string' &&
        nestedErr['statusText'].trim() !== ''
      ) {
        return nestedErr['statusText'];
      }
    }
    if (
      typeof errObj['statusText'] === 'string' &&
      errObj['statusText'].trim() !== ''
    ) {
      return errObj['statusText'];
    }
  }

  try {
    const str = String(error);
    return str === '[object Object]' || str.trim() === ''
      ? 'An unexpected error occurred.'
      : str;
  } catch {
    return 'An unexpected error occurred.';
  }
};

export const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;
