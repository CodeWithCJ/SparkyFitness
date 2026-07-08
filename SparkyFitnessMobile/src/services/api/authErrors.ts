/**
 * Auth error types, kept in their own module (free of `better-auth` and other
 * heavy imports) so consumers — and especially tests that only need the error
 * class — can import it without pulling the whole auth service into their
 * module graph.
 */
export class LoginError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'LoginError';
  }
}
