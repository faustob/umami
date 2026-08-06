import { getQueryFilters, parseRequest, setWebsiteDate } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { reportResultSchema } from '@/lib/schema';
import { recordValidationOutcome, withReportFlow } from '@/lib/telemetry';
import { canViewWebsiteSection } from '@/permissions';
import { type BreakdownParameters, getBreakdown } from '@/queries/sql';

export async function POST(request: Request) {
  return withReportFlow(
    { report: 'breakdown', method: 'POST', route: '/api/reports/breakdown' },
    async flow => {
      const { auth, body, error } = await parseRequest(request, reportResultSchema);

      recordValidationOutcome(flow, 'parse_request', !error);

      if (error) {
        return error();
      }

      const { websiteId } = body;

      const authorized = await canViewWebsiteSection(auth, websiteId, 'breakdown');

      recordValidationOutcome(flow, 'authorize', authorized);

      if (!authorized) {
        return unauthorized();
      }

      const parameters = await setWebsiteDate(websiteId, body.parameters);
      const filters = await getQueryFilters(body.filters, websiteId);

      const data = await getBreakdown(websiteId, parameters as BreakdownParameters, filters);

      return json(data);
    },
  );
}
