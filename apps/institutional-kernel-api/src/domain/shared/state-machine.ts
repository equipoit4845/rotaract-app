import { DomainError } from "./domain.error";

export class StateMachine<T extends string> {
  constructor(
    private readonly transitions: Readonly<Record<T, readonly T[]>>,
  ) {}
  assertTransition(from: T, to: T): void {
    if (!this.transitions[from]?.includes(to))
      throw new DomainError(
        "INVALID_TRANSITION",
        `Cannot transition from ${from} to ${to}`,
      );
  }
}
