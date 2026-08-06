import { registerOTel } from '@vercel/otel';

/**
 * Next.js automatically invokes register() once at server startup.
 * Registers the OpenTelemetry SDK as the global instance so that
 * metrics.getMeter()/trace.getTracer() calls in server code are not no-ops.
 *
 * The OTLP endpoint is env-driven via OTEL_EXPORTER_OTLP_ENDPOINT.
 */
export function register() {
  try {
    registerOTel({
      serviceName: process.env.OTEL_SERVICE_NAME || 'umami',
    });
  } catch (e) {
    // An OTel agent/preload may have already registered a global provider.
    // Tolerate that and continue using the existing global provider.
    // eslint-disable-next-line no-console
    console.warn('OpenTelemetry already registered, using existing global provider', e);
  }
}
