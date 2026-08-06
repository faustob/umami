import { registerOTel } from '@vercel/otel';

/**
 * Next.js automatically invokes this at server startup (Node runtime),
 * registering the OpenTelemetry SDK as the global instance so that
 * `metrics.getMeter()` / `trace.getTracer()` in server code are not no-ops.
 *
 * The OTLP endpoint stays env-driven via OTEL_EXPORTER_OTLP_ENDPOINT.
 */
export function register() {
  try {
    registerOTel({
      serviceName: process.env.OTEL_SERVICE_NAME || 'umami',
    });
  } catch (e) {
    // An OTel agent/preload may already have registered a global provider.
    // Tolerate it and keep using the existing one.
    // eslint-disable-next-line no-console
    console.warn('OpenTelemetry already registered, using existing provider', e);
  }
}
