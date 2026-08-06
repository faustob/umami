import { UTM_PARAMS } from '@/lib/constants';
import type { FlowContext } from '@/lib/telemetry';
import { getQueryFilters, parseRequest, setWebsiteDate } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { reportResultSchema } from '@/lib/schema';
import { recordValidationOutcome, withReportFlow } from '@/lib/telemetry';
import { canViewWebsiteSection } from '@/permissions';
import { getUTM, type UTMParameters } from '@/queries/sql';

export async function POST(request: Request) {
  return withReportFlow(
    { report: 'utm', method: 'POST', route: '/api/reports/utm' },
    async flow => {
      return handleUtmReport(request, flow);
    },
  );
}

async function handleUtmReport(request: Request, flow: FlowContext) {
  const { auth, body, error } = await parseRequest(request, reportResultSchema);

  recordValidationOutcome(flow, 'parse_request', !error);

  if (error) {
    return error();
  }

  const { websiteId } = body;

  const authorized = await canViewWebsiteSection(auth, websiteId, 'utm');

  recordValidationOutcome(flow, 'authorize', authorized);

  if (!authorized) {
    return unauthorized();
  }

  const filters = await getQueryFilters(body.filters, websiteId);
  const parameters = await setWebsiteDate(websiteId, body.parameters);

  const data = {
    utm_source: [],
    utm_medium: [],
    utm_campaign: [],
    utm_term: [],
    utm_content: [],
  };

  for (const key of UTM_PARAMS) {
    data[key] = await getUTM(websiteId, { column: key, ...parameters } as UTMParameters, filters);
  }

  return json(data);
}
