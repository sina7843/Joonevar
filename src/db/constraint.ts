/**
 * Recognising the constraint a failed write ran into.
 *
 * A partial unique index is how this product decides its races — never a read
 * followed by a write — so the code that writes has to be able to tell which
 * index refused it and say so in Persian. The driver's error is wrapped by the
 * query layer, which puts the constraint name on `cause` rather than on the
 * error itself, so the chain is walked instead of the message being searched.
 */
export function violates(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    const candidate = current as { constraint?: string; message?: string; cause?: unknown };
    if (candidate.constraint === constraint) return true;
    if (typeof candidate.message === 'string' && candidate.message.includes(constraint)) return true;
    current = candidate.cause;
  }
  return false;
}
