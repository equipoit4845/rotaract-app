/** An error meant for people: printed without a stack trace. */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {{ hint?: string, exitCode?: number, cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}
