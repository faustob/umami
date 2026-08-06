export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { POST } from '@/app/api/send/route';
import {
  flowDuration,
  flowEntries,
  flowOutcomes,
  flowValidationOutcomes,
  httpServerRequestDuration,
} from '@/lib/telemetry';
import redis from '@/lib/redis';
import { notFound } from '@/lib/response';
import { findPixel } from '@/queries/prisma';

const image = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw', 'base64');

const FLOW_NAME = 'event_collection';
const HTTP_ROUTE = '/p/{slug}';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const tracer = trace.getTracer('umami.event-collection');
  const span = tracer.startSpan('event_collection.flow', {
    attributes: {
      'flow.name': FLOW_NAME,
      'http.request.method': 'GET',
      'http.route': HTTP_ROUTE,
    },
  });
  const flowStart = Date.now();

  flowEntries.add(1, { 'flow.name': FLOW_NAME, 'flow.entry_point': HTTP_ROUTE });

  const recordFlow = (outcome: string, statusCode: number, errorType?: string) => {
    const elapsedSeconds = (Date.now() - flowStart) / 1000;
    const attrs: Record<string, string | number> = {
      'flow.name': FLOW_NAME,
      outcome,
    };

    if (errorType) {
      attrs['error.type'] = errorType;
    }

    flowOutcomes.add(1, attrs);
    flowDuration.record(elapsedSeconds, attrs);
    httpServerRequestDuration.record(elapsedSeconds, {
      'http.request.method': 'GET',
      'http.route': HTTP_ROUTE,
      'http.response.status_code': statusCode,
      'url.scheme': new URL(request.url).protocol.replace(':', ''),
      ...(errorType ? { 'error.type': errorType } : {}),
    });

    span.setAttribute('flow.outcome', outcome);
    span.setAttribute('http.response.status_code', statusCode);

    if (outcome !== 'success') {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    span.end();
  };

  const { slug } = await params;

  let pixel: Awaited<ReturnType<typeof findPixel>>;

  if (redis.enabled) {
    pixel = await redis.client.fetch(
      `pixel:${slug}`,
      async () => {
        return findPixel({
          where: {
            slug,
            deletedAt: null,
          },
        });
      },
      86400,
    );

    if (!pixel) {
      flowValidationOutcomes.add(1, {
        'flow.name': FLOW_NAME,
        'validation.step': 'pixel_lookup',
        outcome: 'failed',
      });
      recordFlow('validation_failed', 404, 'pixel_not_found');
      return notFound();
    }

    flowValidationOutcomes.add(1, {
      'flow.name': FLOW_NAME,
      'validation.step': 'pixel_lookup',
      outcome: 'passed',
    });
  } else {
    pixel = await findPixel({
      where: {
        slug,
        deletedAt: null,
      },
    });

    if (!pixel) {
      flowValidationOutcomes.add(1, {
        'flow.name': FLOW_NAME,
        'validation.step': 'pixel_lookup',
        outcome: 'failed',
      });
      recordFlow('validation_failed', 404, 'pixel_not_found');
      return notFound();
    }

    flowValidationOutcomes.add(1, {
      'flow.name': FLOW_NAME,
      'validation.step': 'pixel_lookup',
      outcome: 'passed',
    });
  }

  const payload = {
    type: 'event',
    payload: {
      pixel: pixel.id,
      url: request.url,
      referrer: request.headers.get('referer') || undefined,
    },
  };

  const req = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(payload),
  });

  await POST(req);

  recordFlow('success', 200);

  return new NextResponse(image, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': image.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
