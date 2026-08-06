import { metrics } from '@opentelemetry/api';

/**
 * Shared OpenTelemetry instruments for the website event collection and
 * enrichment business flow. The SDK is registered globally by the root
 * `instrumentation.ts` (Next.js invokes its `register()` at server startup).
 */
const meter = metrics.getMeter('umami.event-collection');

/** Flow throughput: incremented at every flow entry point invocation. */
export const flowEntries = meter.createCounter('flow.entries', {
  description: 'Number of times the event collection flow entry point was invoked',
});

/** Flow success rate: terminal outcome of the flow (success / validation_failed / error). */
export const flowOutcomes = meter.createCounter('flow.outcomes', {
  description: 'Terminal outcomes of the event collection flow',
});

/** Flow latency + freshness: entry-to-terminal wall clock duration. */
export const flowDuration = meter.createHistogram('flow.duration', {
  description: 'End-to-end duration of the event collection flow from entry to terminal state',
  unit: 's',
});

/** Validation failure rate: per-step validation outcomes. */
export const flowValidationOutcomes = meter.createCounter('flow.validation.outcomes', {
  description: 'Outcomes of individual validation steps within the event collection flow',
});

/** OTel semantic convention: inbound HTTP request duration in seconds. */
export const httpServerRequestDuration = meter.createHistogram('http.server.request.duration', {
  description: 'Duration of inbound HTTP requests',
  unit: 's',
});
