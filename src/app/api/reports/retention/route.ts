import { getQueryFilters, parseRequest, setWebsiteDate } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { reportResultSchema } from '@/lib/schema';
import { recordValidationOutcome, withReportFlow } from '@/lib/telemetry';
import { canViewWebsiteSection } from '@/permissions';
import { getRetention, type RetentionParameters } from '@/queries/sql';

export async function POST(request: Request) {
  return withReportFlow(
    { report: 'retention', method: 'POST', route: '/api/reports/retention' },
    async flow => {
      const { auth, body, error } = await parseRequest(request, reportResultSchema);

      recordValidationOutcome(flow, 'parse_request', !error);

      if (error) {
        return error();
      }

      const { websiteId } = body;

      const authorized = await canViewWebsiteSection(auth, websiteId, 'retention');

      recordValidationOutcome(flow, 'authorize', authorized);

      if (!authorized) {
        return unauthorized();
      }

      const filters = await getQueryFilters(body.filters, websiteId);
      const parameters = await setWebsiteDate(websiteId, body.parameters);

      const data = await getRetention(websiteId, parameters as RetentionParameters, filters);

      return json(data);
    },
  );
}
