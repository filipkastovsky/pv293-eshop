import { OrderPlaced } from '../../contracts';
import { redact, scrubText } from './redact';

const email = 'ann@example.com';

describe('redact', () => {
  it('walks into nested objects', () => {
    const out = redact({ order: { customer: { email, name: 'Ann' } } });
    expect(out).toEqual({
      order: { customer: { email: '[redacted]', name: 'Ann' } },
    });
  });

  it('matches any key containing "email", case-insensitively, plus the exact key "to"', () => {
    const out = redact({
      recipientEmail: email,
      customer_email: email,
      EMAIL_ADDRESS: email,
      to: email,
      total: 5,
      together: 'kept',
    });
    expect(out).toEqual({
      recipientEmail: '[redacted]',
      customer_email: '[redacted]',
      EMAIL_ADDRESS: '[redacted]',
      to: '[redacted]',
      total: 5,
      together: 'kept',
    });
  });

  it('walks into arrays of events (class instances) and leaves the originals alone', () => {
    const events = [1, 2].map(
      (n) =>
        new OrderPlaced({
          orderId: `o-${n}`,
          customerEmail: email,
          lines: [{ sku: 'X', quantity: 1, unitPrice: 5 }],
          total: 5,
        }),
    );
    const out = redact({ events: [{ payload: events[0] }, events[1]] });
    expect(JSON.stringify(out)).not.toContain(email);
    expect(out).toMatchObject({
      events: [
        { payload: { orderId: 'o-1', customerEmail: '[redacted]' } },
        { orderId: 'o-2', customerEmail: '[redacted]' },
      ],
    });
    expect(events[0].customerEmail).toBe(email);
  });

  it('survives a cyclic object', () => {
    const a: Record<string, unknown> = { name: 'a', email };
    a.self = a;
    a.list = [a];
    let out: Record<string, unknown> = {};
    expect(() => {
      out = redact({ a });
    }).not.toThrow();
    expect(JSON.stringify(out)).not.toContain(email);
  });

  it('caps the depth instead of walking forever', () => {
    let deep: Record<string, unknown> = { email };
    for (let i = 0; i < 50; i++) deep = { next: deep };
    const out = redact({ deep });
    expect(JSON.stringify(out)).not.toContain(email);
  });

  it('keeps dates and errors as they are', () => {
    const when = new Date(0);
    const error = new Error('x');
    const out = redact({ when, error, nested: { when } });
    expect(out.when).toBe(when);
    expect(out.error).toBe(error);
    expect((out.nested as { when: Date }).when).toBe(when);
  });
});

describe('scrubText', () => {
  it('drops the bound parameters of a failed query, keeps the SQL', () => {
    const text = `Failed query: insert into "orders" ("email") values ($1)\nparams: ${email},5`;
    expect(scrubText(text)).toBe(
      'Failed query: insert into "orders" ("email") values ($1)',
    );
  });

  it('cuts the params line out of a stack, keeps the frames', () => {
    const stack = `Error: Failed query: select 1\nparams: ${email}\n    at foo (a.ts:1:1)`;
    const out = scrubText(stack);
    expect(out).not.toContain(email);
    expect(out).toContain('at foo (a.ts:1:1)');
  });

  it('masks email-shaped text anywhere else', () => {
    expect(scrubText(`duplicate key (email)=(${email}) exists`)).toBe(
      'duplicate key (email)=([redacted]) exists',
    );
  });

  it('keeps stack frames with scoped package paths', () => {
    const line =
      'at AsyncLocalStorageContextManager.with (/app/node_modules/@opentelemetry/context-async-hooks/build/src/AsyncLocalStorageContextManager.js:45:34)';
    expect(scrubText(line)).toBe(line);
  });

  it.each(['a@b.cz', 'first.last+tag@sub.example.com', 'params: x, a@b.cz'])('still masks %s', (input) => {
    expect(scrubText(input)).not.toMatch(/@/);
  });

  it('leaves clean text alone', () => {
    expect(scrubText('boom')).toBe('boom');
  });
});
