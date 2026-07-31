import { redirect } from "next/navigation";
import { createClient } from "@/core/database/server";
import { getAnalyticsData } from "@/modules/analytics/queries";
import AnalyticsDashboard from "./AnalyticsDashboard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const organizationId = user.user_metadata?.organization_id;
  if (!organizationId) return <div className="p-10 text-white">Error: usuario sin organización asignada.</div>;

  const params = await searchParams;
  const getParam = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  const data = await getAnalyticsData(organizationId, {
    type: getParam("period"),
    year: getParam("year"),
    segment: getParam("segment"),
    cursor: getParam("cursor"),
  });

  return <AnalyticsDashboard data={data} />;
}
