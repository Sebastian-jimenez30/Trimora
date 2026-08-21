import { NextResponse } from "next/server";
import {
  CustomerAuthorizationError,
  requireCustomerActor,
} from "@/modules/public-booking/server/customer-actor";
import { createPublicAuthClient } from "@/modules/public-booking/server/public-auth-client";
import { registerIdentityEvent } from "@/modules/public-booking/server/identity-repository";
import { isTrustedPublicMutation } from "@/modules/public-booking/server/identity-security";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const actor = await requireCustomerActor(slug);
    return NextResponse.json(
      {
        success: true,
        data: { authenticated: true, customer: { displayName: actor.displayName } },
      },
      { headers },
    );
  } catch (error) {
    const status =
      error instanceof CustomerAuthorizationError && error.code === "UNAVAILABLE" ? 404 : 401;
    return NextResponse.json(
      { success: false, error: "Sesión no disponible" },
      { status, headers },
    );
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!isTrustedPublicMutation(request)) {
    return NextResponse.json(
      { success: false, error: "Solicitud no permitida" },
      { status: 403, headers },
    );
  }

  const { slug } = await context.params;
  try {
    const actor = await requireCustomerActor(slug);
    await registerIdentityEvent({
      organizationId: actor.organizationId,
      identityId: actor.identityId,
      authUserId: actor.authUserId,
      eventType: "SESSION_CLOSED",
      outcome: "ACCEPTED",
    });
  } catch {
    // Closing an absent session remains idempotent and reveals no identity state.
  }
  const supabase = await createPublicAuthClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.json({ success: true }, { headers });
}
