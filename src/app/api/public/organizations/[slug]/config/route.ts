import { NextResponse } from "next/server";
import { getPublicBookingConfig } from "@/modules/public-booking/application/get-public-config";
import { publicOrganizationProfileRepository } from "@/modules/public-booking/server/profile-repository";

export const dynamic = "force-dynamic";

const unavailableResponse = () =>
  NextResponse.json(
    { success: false, error: "Página pública no disponible" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const config = await getPublicBookingConfig(publicOrganizationProfileRepository, slug);

  if (!config) return unavailableResponse();

  return NextResponse.json(
    { success: true, data: config },
    { headers: { "Cache-Control": "no-store" } },
  );
}
