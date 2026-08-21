import { NextResponse } from "next/server";
import { verifyCustomerIdentity } from "@/modules/public-booking/application/customer-identity";
import {
  isTrustedPublicMutation,
  readPublicJsonBody,
} from "@/modules/public-booking/server/identity-security";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isTrustedPublicMutation(request)) {
    return NextResponse.json(
      { success: false, error: "Solicitud no permitida" },
      { status: 403, headers },
    );
  }

  let body: unknown;
  try {
    body = await readPublicJsonBody(request);
  } catch {
    return NextResponse.json(
      { success: false, error: "Solicitud inválida" },
      { status: 400, headers },
    );
  }

  const { slug } = await context.params;
  const result = await verifyCustomerIdentity(slug, body);
  if (!result.success) {
    const status = result.code === "UNAVAILABLE" ? 404 : result.code === "INVALID" ? 400 : 401;
    const error =
      result.code === "UNAVAILABLE"
        ? "Acceso no disponible"
        : result.code === "INVALID"
          ? "Solicitud inválida"
          : "No fue posible verificar el código";
    return NextResponse.json({ success: false, error }, { status, headers });
  }

  return NextResponse.json(result, { headers });
}
