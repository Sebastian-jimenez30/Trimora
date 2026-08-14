import { NextResponse } from "next/server";
import { getPublicAvailability } from "@/modules/public-booking/application/get-public-availability";
import { publicAvailabilityRepository } from "@/modules/public-booking/server/availability-repository";

export const dynamic = "force-dynamic";

const unavailableResponse = () =>
  NextResponse.json(
    { success: false, error: "Disponibilidad no disponible" },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  );

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const availability = await getPublicAvailability(publicAvailabilityRepository, slug, {
    serviceId: searchParams.get("serviceId"),
    date: searchParams.get("date"),
  });

  if (!availability) return unavailableResponse();

  return NextResponse.json(
    { success: true, data: availability },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
