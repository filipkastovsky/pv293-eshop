import { INestApplication, Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PlatformLogger } from '../../src/platform/telemetry/logger';
import { createTestDb, TestDb } from '../setup-db';
import { resetTelemetry } from './telemetry';

export interface TimelineEntry {
  at: string;
  kind: 'event' | 'handler_failed';
  name: string;
  payload: Record<string, unknown>;
}

export interface TestApp {
  http: () => ReturnType<typeof request>;
  emit(eventName: string, payload: object): Promise<void>;
  timeline(orderId: string): Promise<TimelineEntry[]>;
  /** Polls until `names` appear in the timeline as an in-order subsequence. */
  waitForTimeline(
    orderId: string,
    names: string[],
    timeoutMs?: number,
  ): Promise<TimelineEntry[]>;
  close(): Promise<void>;
}

const isSubsequence = (names: string[], wanted: string[]) => {
  let i = 0;
  for (const n of names) if (n === wanted[i]) i++;
  return i === wanted.length;
};

export interface BootOptions {
  /** Extra providers next to AppModule, e.g. a test-only event handler. */
  providers?: Provider[];
}

/** Boots the whole app (all modules) against a fresh throwaway database. */
export async function bootTestApp(options: BootOptions = {}): Promise<TestApp> {
  resetTelemetry();
  const db: TestDb = await createTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.DEV_ENDPOINTS = 'true';
  // Imported late: PlatformModule.register() reads DEV_ENDPOINTS when AppModule loads.
  const { AppModule } = require('../../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    providers: options.providers ?? [],
  })
    // Records still reach the in-memory OTel exporter (`logs`); stdout stays clean.
    .overrideProvider(PlatformLogger)
    .useValue(new PlatformLogger({ destination: { write: () => undefined } }))
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.useLogger(app.get(PlatformLogger));
  await app.init();

  let closed = false;
  const http = () => request(app.getHttpServer());
  const timeline = async (orderId: string) =>
    (await http().get(`/orders/${orderId}/timeline`)).body
      .entries as TimelineEntry[];

  return {
    http,
    timeline,
    async emit(eventName, payload) {
      await http().post(`/dev/emit/${eventName}`).send(payload).expect(202);
    },
    async waitForTimeline(orderId, names, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      let entries = await timeline(orderId);
      while (
        !isSubsequence(
          entries.map((e) => e.name),
          names,
        )
      ) {
        if (closed || Date.now() > deadline) {
          throw new Error(
            `Timeline of ${orderId} never contained [${names.join(', ')}] in order. Got: [${entries.map((e) => e.name).join(', ')}]`,
          );
        }
        await new Promise((r) => setTimeout(r, 100));
        entries = await timeline(orderId);
      }
      return entries;
    },
    async close() {
      closed = true;
      await app.close();
      await db.drop();
      delete process.env.DEV_ENDPOINTS;
    },
  };
}
