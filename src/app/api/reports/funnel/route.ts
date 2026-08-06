import { getQueryFilters, parseRequest, setWebsiteDate } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { reportResultSchema } from '@/lib/schema';
import { recordValidationOutcome, withReportFlow } from '@/lib/telemetry';
import { canViewWebsiteSection } from '@/permissions';
import { type FunnelParameters, getFunnel } from '@/queries/sql';

export async function POST(request: Request) {
  return withReportFlow(
    { report: 'funnel', method: 'POST', route: '/api/reports/funnel' },
    async flow => {
      const { auth, body, error } = await parseRequest(request, reportResultSchema);

      recordValidationOutcome(flow, 'parse_request', !error);

      if (error) {
        return error();
      }

      const { websiteId } = body;

      const authorized = await canViewWebsiteSection(auth, websiteId, 'funnels');

      recordValidationOutcome(flow, 'authorize', authorized);

      if (!authorized) {
        return unauthorized();
      }

      const parameters = await setWebsiteDate(websiteId, body.parameters);
      const filters = await getQueryFilters(body.filters, websiteId);

      const data = await getFunnel(websiteId, parameters as FunnelParameters, filters);

      return json(data);
    },
  );
}
