export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { POST } from '@/app/api/send/route';
import {
  flowDuration,
  flowEntries,
  flowEntryToTerminalDuration,
  flowOutcomes,
  flowValidationOutcomes,
  flowTracer,
} from '@/lib/telemetry';
import { SpanStatusCode } from '@opentelemetry/api';
import redis from '@/lib/redis';
import { notFound } from '@/lib/response';
import { findPixel } from '@/queries/prisma';

const image = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw', 'base64');

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const flowAttributes = { 'flow.name': 'pixel_collect', 'http.route': '/p/{slug}' };
  const flowStart = Date.now();
  const flowSpan = flowTracer.startSpan('flow pixel_collect', {
    attributes: { ...flowAttributes, 'http.request.method': 'GET' },
  });

  flowEntries.add(1, flowAttributes);

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
      flowValidationOutcomes.add(1, { ...flowAttributes, 'flow.step': 'pixel_lookup', outcome: 'failed' });
      flowOutcomes.add(1, { ...flowAttributes, outcome: 'failure', 'error.type': 'pixel_not_found' });
      flowDuration.record((Date.now() - flowStart) / 1000, {
        ...flowAttributes,
        outcome: 'failure',
      });
      flowSpan.setAttribute('flow.outcome', 'failure');
      flowSpan.setAttribute('error.type', 'pixel_not_found');
      flowSpan.setStatus({ code: SpanStatusCode.ERROR });
      flowSpan.end();
      return notFound();
    }

    flowValidationOutcomes.add(1, { ...flowAttributes, 'flow.step': 'pixel_lookup', outcome: 'passed' });
  } else {
    pixel = await findPixel({
      where: {
        slug,
        deletedAt: null,
      },
    });

    if (!pixel) {
      flowValidationOutcomes.add(1, { ...flowAttributes, 'flow.step': 'pixel_lookup', outcome: 'failed' });
      flowOutcomes.add(1, { ...flowAttributes, outcome: 'failure', 'error.type': 'pixel_not_found' });
      flowDuration.record((Date.now() - flowStart) / 1000, {
        ...flowAttributes,
        outcome: 'failure',
      });
      flowSpan.setAttribute('flow.outcome', 'failure');
      flowSpan.setAttribute('error.type', 'pixel_not_found');
      flowSpan.setStatus({ code: SpanStatusCode.ERROR });
      flowSpan.end();
      return notFound();
    }

    flowValidationOutcomes.add(1, { ...flowAttributes, 'flow.step': 'pixel_lookup', outcome: 'passed' });
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

  flowOutcomes.add(1, { ...flowAttributes, outcome: 'success' });
  flowDuration.record((Date.now() - flowStart) / 1000, { ...flowAttributes, outcome: 'success' });
  flowEntryToTerminalDuration.record((Date.now() - flowStart) / 1000, {
    ...flowAttributes,
    outcome: 'success',
  });
  flowSpan.setAttribute('flow.outcome', 'success');
  flowSpan.setStatus({ code: SpanStatusCode.OK });
  flowSpan.end();

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
