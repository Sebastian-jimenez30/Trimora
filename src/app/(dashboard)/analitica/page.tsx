import { requireActor } from "@/core/auth/server/actor";
import { getAnalyticsData } from "@/modules/analytics/queries";
import AnalyticsDashboard from "./AnalyticsDashboard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const { organizationId } = await requireActor();

  const params = await searchParams;
  const getParam = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : undefined;
  const data = await getAnalyticsData(organizationId, {
    type: getParam("period"),
    year: getParam("year"),
    segment: getParam("segment"),
    cursor: getParam("cursor"),
  });

  return <AnalyticsDashboard data={data} />;
}
