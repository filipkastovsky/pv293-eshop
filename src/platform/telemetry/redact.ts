export type Fields = Record<string, unknown>;

export const CENSOR = '[redacted]';
const MAX_DEPTH = 6;
const TRUNCATED = '[truncated]';
const CIRCULAR = '[circular]';

/** Any key with "email" in it, plus the exact key `to` (a mail's recipient). */
const isSensitiveKey = (key: string): boolean =>
  key === 'to' || /email/i.test(key);

/**
 * Anything whose own properties are data: plain objects and class instances (domain events),
 * but not arrays, errors or dates.
 */
export const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Error) &&
  !(value instanceof Date);

/**
 * Replaces the value of every sensitive key (`*email*`, `to`) with `[redacted]`, at any depth,
 * through arrays and class instances (copied as their own enumerable properties). Nesting
 * deeper than 6 levels becomes `[truncated]` and a cycle `[circular]`, so a leak cannot hide
 * below the cap. The caller's objects stay as they were.
 */
export function redact(fields: Fields): Fields {
  return redactObject(fields, 0, new Set());
}

function redactObject(
  object: Fields,
  depth: number,
  path: Set<object>,
): Fields {
  path.add(object);
  const out: Fields = {};
  for (const [key, value] of Object.entries(object)) {
    out[key] = isSensitiveKey(key)
      ? CENSOR
      : redactValue(value, depth + 1, path);
  }
  path.delete(object);
  return out;
}

function redactValue(
  value: unknown,
  depth: number,
  path: Set<object>,
): unknown {
  const walkable = Array.isArray(value) || isRecord(value);
  if (!walkable) return value;
  if (path.has(value)) return CIRCULAR;
  if (depth > MAX_DEPTH) return TRUNCATED;
  if (Array.isArray(value)) {
    path.add(value);
    const out = value.map((item) => redactValue(item, depth + 1, path));
    path.delete(value);
    return out;
  }
  return redactObject(value, depth, path);
}

const PARAMS_LINE = /\n?params: [^\n]*/g;
const EMAIL_SHAPED = /[^\s@"',()]+@[^\s@"',()]+\.[a-z]{2,}/gi;

/**
 * Error text may carry values the key-based redaction cannot see. Drizzle's `Failed query`
 * errors append the bound parameters (`params: a@b.cz,...`); that line goes, and any
 * email-shaped text left is masked. Used wherever error text leaves the process: span
 * exception events and status, log records, the timeline.
 */
export function scrubText(text: string): string {
  return text.replace(PARAMS_LINE, '').replace(EMAIL_SHAPED, CENSOR);
}

/** `error.message`, scrubbed; if nothing is left, the cause's message. */
export function scrubbedMessage(error: Error): string {
  const message = scrubText(error.message);
  if (message.trim() !== '') return message;
  const cause = error.cause;
  return cause instanceof Error ? scrubText(cause.message) : message;
}
