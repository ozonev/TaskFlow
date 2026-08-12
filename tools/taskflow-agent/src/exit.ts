export const ExitCode = {
  Success: 0,
  Usage: 1,
  Preflight: 2,
  MaxTurns: 3,
  MaxBudget: 4,
  SdkError: 5,
  VerificationFailed: 6,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class RunnerError extends Error {
  readonly exitCode: ExitCodeValue;

  constructor(exitCode: ExitCodeValue, message: string) {
    super(message);
    this.name = 'RunnerError';
    this.exitCode = exitCode;
  }
}

/** Bad or missing flags. Nothing has happened yet. */
export class UsageError extends RunnerError {
  constructor(message: string) {
    super(ExitCode.Usage, message);
    this.name = 'UsageError';
  }
}

/** A refusal to start: unapproved plan, dirty repo, protected branch, bad worktree. */
export class PreflightError extends RunnerError {
  constructor(message: string) {
    super(ExitCode.Preflight, message);
    this.name = 'PreflightError';
  }
}

export function exitCodeOf(error: unknown): ExitCodeValue {
  return error instanceof RunnerError ? error.exitCode : ExitCode.SdkError;
}
