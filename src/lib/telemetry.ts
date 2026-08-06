import { metrics, trace } from '@opentelemetry/api';

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'umami';

const meter = metrics.getMeter(SERVICE_NAME);

export const flowTracer = trace.getTracer(SERVICE_NAME);

/** Throughput: incremented at every flow entry, independent of outcome. */
export const flowEntries = meter.createCounter('flow.entries', {
  description: 'Number of times a business flow entry point was invoked',
});

/** Availability: terminal outcome of the flow (outcome=success|failure). */
export const flowOutcomes = meter.createCounter('flow.outcomes', {
  description: 'Terminal outcomes of a business flow',
});

/** Error rate: per-step validation outcome (outcome=passed|failed). */
export const flowValidationOutcomes = meter.createCounter('flow.validation.outcomes', {
  description: 'Outcomes of individual business flow validation steps',
});

/** Latency: end-to-end flow duration in seconds. */
export const flowDuration = meter.createHistogram('flow.duration', {
  description: 'End-to-end duration of a business flow',
  unit: 's',
});

/** Freshness: wall-clock time from flow entry to terminal state, in seconds. */
export const flowEntryToTerminalDuration = meter.createHistogram(
  'flow.entry_to_terminal.duration',
  {
    description: 'Wall-clock time between a business flow entry event and its terminal state',
    unit: 's',
  },
);
