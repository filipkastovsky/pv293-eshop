// Loaded with `node --import ./dist/instrumentation.mjs dist/main.js`, before the app.
// The ESM hook must be registered before anything instrumented (express, pg) loads: the app
// reaches express through Nest, which is ESM, so the CommonJS require hook alone misses it.
import { register } from 'import-in-the-middle/register-hooks.mjs';

register();

const { startTelemetry } = await import('./platform/telemetry/telemetry.js');
startTelemetry();
