import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { reportResultSchema } from '@/lib/schema';
import { recordValidationOutcome, withReportFlow } from '@/lib/telemetry';
import { canViewWebsiteSection } from '@/permissions';
import { getJourney } from '@/queries/sql';

export async function POST(request: Request) {
  return withReportFlow(
    { report: 'journey', method: 'POST', route: '/api/reports/journey' },
    async flow => {
      const { auth, body, error } = await parseRequest(request, reportResultSchema);

      recordValidationOutcome(flow, 'parse_request', !error);

      if (error) {
        return error();
      }

      const { websiteId, parameters, filters } = body;
      const { eventType } = parameters;

      const authorized = await canViewWebsiteSection(auth, websiteId, 'journeys');

      recordValidationOutcome(flow, 'authorize', authorized);

      if (!authorized) {
        return unauthorized();
      }

      if (eventType) {
        filters.eventType = eventType;
      }

      const queryFilters = await getQueryFilters(filters, websiteId);

      const data = await getJourney(websiteId, parameters, queryFilters);

      return json(data);
    },
  );
}
