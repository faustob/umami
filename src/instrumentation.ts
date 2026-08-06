/**
 * Next.js automatically invokes `register()` from this file on SERVER startup
 * (it sits alongside `app/`, i.e. under `src/`). This is the ONLY place the
 * OpenTelemetry SDK is registered as the global instance — every meter/tracer
 * obtained via `@opentelemetry/api` elsewhere in the app binds to it.
 *
 * Endpoint/protocol/headers stay env-driven (OTEL_EXPORTER_OTLP_ENDPOINT, ...).
 */
import { registerOTel } from '@vercel/otel';

export function register() {
  // Only the Node.js server runtime should start the SDK; the edge runtime and
  // the browser must not.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    registerOTel({
      serviceName: process.env.OTEL_SERVICE_NAME || 'umami-dashboard-reporting',
    });
  } catch (err) {
    // An OTel language agent / preload may already have registered a global
    // provider (configured outside this repo). Registering a second one throws;
    // tolerate it and keep using the already-registered provider so the app
    // still starts. The instrumented code reads the global provider either way.
    // eslint-disable-next-line no-console
    console.warn('[otel] global provider already registered, continuing:', err);
  }
}
