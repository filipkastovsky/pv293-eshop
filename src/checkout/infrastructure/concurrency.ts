/** Someone saved the same aggregate first; reload and try again. */
export class ConcurrencyError extends Error {
  constructor(aggregate: string, id: string) {
    super(`${aggregate} ${id} was changed concurrently`);
    this.name = 'ConcurrencyError';
  }
}

/** Runs load-change-save again when another save won the race. */
export async function retryOnConflict<T>(
  work: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await work();
    } catch (err) {
      if (!(err instanceof ConcurrencyError) || i >= attempts) throw err;
    }
  }
}
