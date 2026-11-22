/** A business rule said no. The HTTP layer maps `kind` to a status code. */
export class DomainError extends Error {
  constructor(
    readonly kind: 'invalid' | 'not_found' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const invalid = (message: string) => new DomainError('invalid', message);
export const notFound = (message: string) =>
  new DomainError('not_found', message);
export const conflict = (message: string) =>
  new DomainError('conflict', message);
