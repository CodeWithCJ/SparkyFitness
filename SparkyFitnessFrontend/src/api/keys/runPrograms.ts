export const runProgramKeys = {
  all: ['runProgram'] as const,
  /** The person's active (or paused) program and their place in it. */
  current: () => [...runProgramKeys.all, 'current'] as const,
  /** The person's own saved programs. */
  custom: () => [...runProgramKeys.all, 'custom'] as const,
};
