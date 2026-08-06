/**
 * Telemetry for the "Dashboard reporting and insights" business flow.
 *
 * This module OWNS the meter and every flow instrument exactly once; the report
 * route handlers import `withReportFlow` / `recordValidationOutcome` and are the
 * real measurement sites. The global SDK is registered at server startup by
 * `src/instrumentation.ts`.
 */
import { type Span, SpanStatusCode, metrics, trace } from '@opentelemetry/api';

const SCOPE = 'umami.dashboard.reporting';

const meter = metrics.getMeter(SCOPE);
const tracer = trace.getTracer(SCOPE);

/** Flow throughput: every invocation of a report flow entry point. */
const flowEntries = meter.createCounter('flow.entries', {
  description: 'Report flow entry-point invocations, independent of eventual outcome.',
});

/** Flow success rate: terminal outcome of each report flow. */
const flowOutcomes = meter.createCounter('flow.outcomes', {
  description: 'Terminal outcomes of the report flow (success | failure).',
});

/** Flow latency P95: wall-clock duration of the flow, in SECONDS. */
const flowDuration = meter.createHistogram('flow.duration', {
  description: 'End-to-end duration of the report flow.',
  unit: 's',
});

/** Flow completion freshness: entry event -> terminal state transition, in SECONDS. */
const flowEntryToTerminalDuration = meter.createHistogram('flow.entry_to_terminal.duration', {
  description: 'Wall-clock time between the report flow entry event and its terminal state.',
  unit: 's',
});

/** Validation failure rate: pass/fail of each validation step in the flow. */
const flowValidationOutcomes = meter.createCounter('flow.validation.outcomes', {
  description: 'Per-step validation outcomes of the report flow (passed | failed).',
});

/** In-flight report flows — goes up and down, so an UpDownCounter. */
const flowActive = meter.createUpDownCounter('flow.active', {
  description: 'Report flows currently in progress.',
});

export interface FlowOptions {
  /** Low-cardinality report kind, e.g. `funnel`, `revenue`. */
  report: string;
  /** HTTP method of the entry point. */
  method: string;
  /** Matched route TEMPLATE, never a raw path. */
  route: string;
}

export interface FlowContext {
  readonly flow: string;
  readonly report: string;
  readonly route: string;
  readonly span: Span;
  /** Trace id of the entry span — the end-to-end correlation key. */
  readonly traceId: string;
}

function baseAttributes(options: FlowOptions) {
  return {
    flow: 'dashboard_reporting',
    'flow.report': options.report,
    'http.request.method': options.method,
    'http.route': options.route,
  };
}

function errorType(err: unknown) {
  if (err instanceof Error && err.name) {
    return err.name;
  }
  return typeof err;
}

/**
 * Records the pass/fail outcome of one validation step as a nested span plus a
 * counter increment. `passed` is derived from the value the handler ALREADY
 * computed, so control flow is untouched.
 */
export function recordValidationOutcome(flow: FlowContext, step: string, passed: boolean) {
  flowValidationOutcomes.add(1, {
    flow: flow.flow,
    'flow.report': flow.report,
    'flow.step': step,
    outcome: passed ? 'passed' : 'failed',
  });

  const span = tracer.startSpan(`report.validate ${step}`, {
    attributes: {
      flow: flow.flow,
      'flow.report': flow.report,
      'flow.step': step,
      'flow.validation.passed': passed,
      'flow.id': flow.traceId,
    },
  });

  if (!passed) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }

  span.end();
}

/**
 * Wraps a report flow entry point: opens the root span, counts the entry, and on
 * the terminal state records the outcome, the flow duration and the
 * entry-to-terminal freshness. Any thrown error is recorded and RE-THROWN
 * unchanged, so propagation and status codes are preserved exactly.
 */
export async function withReportFlow<T extends Response>(
  options: FlowOptions,
  handler: (flow: FlowContext) => Promise<T>,
): Promise<T> {
  // Typed explicitly so the generic return type survives startActiveSpan's overloads.
  const attributes = baseAttributes(options);
  const entryTime = Date.now();

  flowEntries.add(1, attributes);

  return tracer.startActiveSpan<(span: Span) => Promise<T>>(
    `report.flow ${options.report}`,
    { attributes },
    async (span: Span) => {
      const traceId = span.spanContext().traceId;
      const flow: FlowContext = {
        flow: 'dashboard_reporting',
        report: options.report,
        route: options.route,
        span,
        traceId,
      };

      // Correlation key for downstream/async hops rolling back into this span.
      span.setAttribute('flow.id', traceId);
      flowActive.add(1, attributes);

      let outcome = 'failure';
      let status: number | undefined;
      let failure: unknown;

      try {
        const response = await handler(flow);

        status = response.status;
        outcome = response.ok ? 'success' : 'failure';

        return response;
      } catch (err) {
        failure = err;
        // Re-thrown below unchanged — never swallowed.
        throw err;
      } finally {
        const durationSeconds = (Date.now() - entryTime) / 1000;

        const terminalAttributes: Record<string, string | number> = {
          ...attributes,
          outcome,
        };

        if (status !== undefined) {
          terminalAttributes['http.response.status_code'] = status;
        }

        if (outcome === 'failure') {
          terminalAttributes['error.type'] = failure
            ? errorType(failure)
            : String(status ?? 'unknown');
        }

        flowActive.add(-1, attributes);
        flowOutcomes.add(1, terminalAttributes);
        flowDuration.record(durationSeconds, terminalAttributes);
        flowEntryToTerminalDuration.record(durationSeconds, terminalAttributes);

        span.setAttribute('flow.outcome', outcome);

        if (status !== undefined) {
          span.setAttribute('http.response.status_code', status);
        }

        if (failure) {
          span.recordException(failure as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: errorType(failure) });
        } else if (outcome === 'failure') {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }

        span.end();
      }
    },
  );
}
